package io.uliss.note_service.config

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.client.advisor.SimpleLoggerAdvisor
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.model.ChatModel
import org.springframework.ai.chat.model.ChatResponse
import org.springframework.ai.chat.model.Generation
import org.springframework.ai.chat.prompt.Prompt
import reactor.core.publisher.Flux
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ChatClientConfigTest {

    private class FakeChatModel(private val properties: Map<String, Any> = emptyMap()) : ChatModel {
        override fun call(prompt: Prompt): ChatResponse = response("full answer")

        override fun stream(prompt: Prompt): Flux<ChatResponse> =
            Flux.just(response("streamed "), response("answer"))

        private fun response(text: String) =
            ChatResponse(listOf(Generation(AssistantMessage.builder().content(text).properties(properties).build())))
    }

    /** Provider metadata the JSON mapper cannot serialize. */
    class Unserializable {
        @Suppress("unused")
        val value: String get() = throw IllegalStateException("not serializable")
    }

    private val advisorLogger = LoggerFactory.getLogger(SimpleLoggerAdvisor::class.java) as Logger
    private val logEvents = ListAppender<ILoggingEvent>()
    private val chatClient = ChatClientConfig().chatClient(ChatClient.builder(FakeChatModel()))

    @BeforeEach
    fun attachAppender() {
        logEvents.start()
        advisorLogger.addAppender(logEvents)
        advisorLogger.level = Level.DEBUG
    }

    @AfterEach
    fun detachAppender() {
        advisorLogger.detachAppender(logEvents)
        advisorLogger.level = null
    }

    private fun messages() = logEvents.list.map { it.formattedMessage }

    @Test
    fun `logs the whole model request and the response of a call`() {
        chatClient.prompt().system(SYSTEM_PROMPT).user(LONG_PROMPT).call().content()

        val (request, response) = messages()
        assertContains(request, SYSTEM_PROMPT)
        assertContains(request, LONG_PROMPT)
        assertContains(response, "full answer")
    }

    @Test
    fun `logs the whole model request and the aggregated response of a stream`() {
        chatClient.prompt().system(SYSTEM_PROMPT).user(LONG_PROMPT).stream().content().collectList().block()

        val (request, response) = messages()
        assertContains(request, LONG_PROMPT)
        assertContains(response, "streamed answer")
    }

    @Test
    fun `a response the log cannot serialize never breaks the stream`() {
        val client = ChatClientConfig().chatClient(ChatClient.builder(FakeChatModel(mapOf("broken" to Unserializable()))))

        val tokens = client.prompt().user("hi").stream().content().collectList().block()

        assertEquals(listOf("streamed ", "answer"), tokens)
        assertContains(messages().last(), "unrenderable")
    }

    @Test
    fun `logs nothing about the model exchange when debug is off`() {
        advisorLogger.level = Level.INFO

        chatClient.prompt().user(LONG_PROMPT).call().content()

        assertTrue(logEvents.list.isEmpty())
    }

    private companion object {
        const val SYSTEM_PROMPT = "You are the Uliss assistant."
        // longer than the call-tracing truncation, which this log must not apply
        val LONG_PROMPT = "word ".repeat(300) + "end-of-prompt"
    }
}
