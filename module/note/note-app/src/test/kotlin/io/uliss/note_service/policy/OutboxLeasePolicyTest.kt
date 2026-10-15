package io.uliss.note_service.policy

import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxProperties
import org.junit.jupiter.api.Test
import org.springframework.ai.model.openai.autoconfigure.OpenAiChatProperties
import org.springframework.ai.model.openai.autoconfigure.OpenAiCommonProperties
import org.springframework.ai.model.openai.autoconfigure.OpenAiEmbeddingProperties
import java.time.Duration
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean
import org.springframework.boot.context.properties.bind.Binder
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource
import org.springframework.core.io.FileSystemResource
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class OutboxLeasePolicyTest {

    // Fixed inputs for the lease formula (embedding 60s with one retry, chat on SDK defaults: 60s, 3 retries);
    // the shipped application.yaml is checked against the agreed bound separately.
    private fun embedding(timeout: Duration = Duration.ofSeconds(60), maxRetries: Int = 1) =
        OpenAiEmbeddingProperties().apply {
            this.timeout = timeout
            this.maxRetries = maxRetries
        }

    private fun policy(
        common: OpenAiCommonProperties = OpenAiCommonProperties(),
        chat: OpenAiChatProperties = OpenAiChatProperties(),
        embedding: OpenAiEmbeddingProperties = embedding(),
    ) = OutboxLeasePolicy(common, chat, embedding, OutboxProperties(leaseSafetyFactor = 1.3))

    @Test
    fun `index lease covers every embedding call plus the SDK backoff between them`() {
        // (60s * 2 calls + 0.5s backoff) * 1.3
        assertEquals(Duration.ofMillis(156_650), policy().leaseFor(OutboxEventType.NOTE_INDEX_REQUESTED))
    }

    @Test
    fun `summary lease adds the chat calls with SDK defaults and their backoff`() {
        // embedding 120.5s + chat (60s * 4 calls + 0.5 + 1 + 2 backoff) = 364s, * 1.3
        assertEquals(Duration.ofMillis(473_200), policy().leaseFor(OutboxEventType.NOTE_SUMMARY_REQUESTED))
    }

    @Test
    fun `summary update lease matches the summary lease`() {
        val policy = policy()
        assertEquals(
            policy.leaseFor(OutboxEventType.NOTE_SUMMARY_REQUESTED),
            policy.leaseFor(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED),
        )
    }

    @Test
    fun `chat-level timeout and retries take precedence over the common ones`() {
        val chat = OpenAiChatProperties().apply {
            timeout = Duration.ofSeconds(300)
            maxRetries = 1
        }

        // embedding 120.5s + chat (300s * 2 calls + 0.5s) = 721s, * 1.3
        assertEquals(
            Duration.ofMillis(937_300),
            policy(chat = chat).leaseFor(OutboxEventType.NOTE_SUMMARY_REQUESTED),
        )
    }

    @Test
    fun `common OpenAI timeout applies to chat when chat sets none`() {
        val common = OpenAiCommonProperties().apply { timeout = Duration.ofSeconds(120) }
        val embedding = embedding(timeout = Duration.ofSeconds(30))

        // embedding (30s * 2 + 0.5s) 60.5s + chat (120s * 4 + 3.5s) 483.5s = 544s, * 1.3
        assertEquals(
            Duration.ofMillis(707_200),
            policy(common = common, embedding = embedding).leaseFor(OutboxEventType.NOTE_SUMMARY_REQUESTED),
        )
    }

    @Test
    fun `SDK backoff between retries is capped at eight seconds`() {
        val chat = OpenAiChatProperties().apply { maxRetries = 6 }

        // embedding 120.5s + chat (60s * 7 + 0.5 + 1 + 2 + 4 + 8 + 8) 443.5s = 564s, * 1.3
        assertEquals(
            Duration.ofMillis(733_200),
            policy(chat = chat).leaseFor(OutboxEventType.NOTE_SUMMARY_REQUESTED),
        )
    }

    @Test
    fun `the shipped configuration keeps a summary lease within six minutes`() {
        // Agreed bound (2026-10-15): a summary still running after its lease is abandoned, so the lease must stay short.
        // Test resources replace application.yaml on the classpath, so the shipped file is read from disk.
        val yaml = YamlPropertiesFactoryBean().apply { setResources(FileSystemResource("src/main/resources/application.yaml")) }
        val binder = Binder(MapConfigurationPropertySource(checkNotNull(yaml.getObject())))
        fun <T : Any> bind(prefix: String, type: Class<T>): T = binder.bind(prefix, type).orElseGet { type.getDeclaredConstructor().newInstance() }

        val policy = OutboxLeasePolicy(
            bind("spring.ai.openai", OpenAiCommonProperties::class.java),
            bind("spring.ai.openai.chat", OpenAiChatProperties::class.java),
            bind("spring.ai.openai.embedding", OpenAiEmbeddingProperties::class.java),
            binder.bind("note.outbox", OutboxProperties::class.java).get(),
        )

        val lease = policy.leaseFor(OutboxEventType.NOTE_SUMMARY_REQUESTED)
        assertTrue(lease <= Duration.ofMinutes(6), "summary lease is $lease")
    }
}
