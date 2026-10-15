package io.uliss.note_service.policy

import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxProperties
import org.springframework.ai.model.openai.autoconfigure.OpenAiAutoConfigurationUtil
import org.springframework.ai.model.openai.autoconfigure.OpenAiChatProperties
import org.springframework.ai.model.openai.autoconfigure.OpenAiCommonProperties
import org.springframework.ai.model.openai.autoconfigure.OpenAiEmbeddingProperties
import org.springframework.stereotype.Component
import java.time.Duration
import kotlin.math.ceil
import kotlin.math.min
import kotlin.math.pow

// openai-java RetryingHttpClient: 0.5s * 2^(retry-1), capped at 8s, jitter only shortens it.
private const val SDK_BACKOFF_BASE_SECONDS = 0.5
private const val SDK_BACKOFF_MAX_SECONDS = 8.0

/**
 * Lease = worst-case wall time of the provider calls an event makes, from the settings the OpenAI
 * SDK clients are actually built with (spring.ai.openai.*, model level over common). A
 * server-sent Retry-After has no upper bound; lease fencing in OutboxService covers that case.
 */
@Component
class OutboxLeasePolicy(
    commonProperties: OpenAiCommonProperties,
    chatProperties: OpenAiChatProperties,
    embeddingProperties: OpenAiEmbeddingProperties,
    outboxProperties: OutboxProperties,
) {
    private val indexLease: Duration
    private val summaryLease: Duration
    private val safetyFactor = outboxProperties.leaseSafetyFactor

    init {
        val chat = OpenAiAutoConfigurationUtil.resolveCommonProperties(commonProperties, chatProperties)
        val embedding = OpenAiAutoConfigurationUtil.resolveCommonProperties(commonProperties, embeddingProperties)
        require(safetyFactor >= 1.0) { "lease safety factor must be at least 1.0" }

        val embeddingBudget = callBudget(embedding.timeout, embedding.maxRetries)
        indexLease = withSafetyFactor(embeddingBudget)
        summaryLease = withSafetyFactor(embeddingBudget.plus(callBudget(chat.timeout, chat.maxRetries)))
    }

    fun leaseFor(type: OutboxEventType): Duration = when (type) {
        OutboxEventType.NOTE_INDEX_REQUESTED -> indexLease
        OutboxEventType.NOTE_SUMMARY_REQUESTED -> summaryLease
    }

    private fun callBudget(timeout: Duration, maxRetries: Int): Duration {
        require(!timeout.isNegative && !timeout.isZero) { "OpenAI timeout must be positive" }
        require(maxRetries >= 0) { "OpenAI max retries must not be negative" }
        val backoffSeconds = (1..maxRetries).sumOf { retry ->
            min(SDK_BACKOFF_BASE_SECONDS * 2.0.pow(retry - 1), SDK_BACKOFF_MAX_SECONDS)
        }
        return timeout.multipliedBy((maxRetries + 1).toLong())
            .plusMillis(ceil(backoffSeconds * 1000).toLong())
    }

    private fun withSafetyFactor(duration: Duration): Duration =
        Duration.ofMillis(ceil(duration.toMillis() * safetyFactor).toLong())
}
