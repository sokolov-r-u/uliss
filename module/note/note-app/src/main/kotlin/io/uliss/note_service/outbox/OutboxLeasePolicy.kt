package io.uliss.note_service.outbox

import org.springframework.ai.model.openai.autoconfigure.OpenAiEmbeddingProperties
import org.springframework.ai.retry.autoconfigure.SpringAiRetryProperties
import org.springframework.boot.http.client.HttpClientSettings
import org.springframework.stereotype.Component
import java.time.Duration
import kotlin.math.ceil

@Component
class OutboxLeasePolicy(
    embeddingProperties: OpenAiEmbeddingProperties,
    retryProperties: SpringAiRetryProperties,
    httpClientSettings: HttpClientSettings,
    outboxProperties: OutboxProperties,
) {
    private val indexLease: Duration
    private val summaryLease: Duration
    private val safetyFactor = outboxProperties.leaseSafetyFactor

    init {
        val embeddingTimeout = embeddingProperties.timeout
        val embeddingMaxRetries = embeddingProperties.maxRetries
        val connectTimeout = requireNotNull(httpClientSettings.connectTimeout()) {
            "HTTP client connect timeout must be configured"
        }
        val chatReadTimeout = requireNotNull(httpClientSettings.readTimeout()) {
            "HTTP client read timeout must be configured"
        }
        val chatMaxAttempts = retryProperties.maxAttempts
        require(!embeddingTimeout.isNegative && !embeddingTimeout.isZero) { "embedding timeout must be positive" }
        require(embeddingMaxRetries >= 0) { "embedding max retries must not be negative" }
        require(!connectTimeout.isNegative) { "connect timeout must not be negative" }
        require(!chatReadTimeout.isNegative && !chatReadTimeout.isZero) { "chat read timeout must be positive" }
        require(chatMaxAttempts > 0) { "chat max attempts must be positive" }
        require(safetyFactor >= 1.0) { "lease safety factor must be at least 1.0" }

        val embeddingBudget = embeddingTimeout.multipliedBy((embeddingMaxRetries + 1).toLong())
        val chatAttemptBudget = connectTimeout.plus(chatReadTimeout)
        indexLease = withSafetyFactor(embeddingBudget)
        summaryLease = withSafetyFactor(
            embeddingBudget.plus(chatAttemptBudget.multipliedBy(chatMaxAttempts.toLong()))
        )
    }

    fun leaseFor(type: OutboxEventType): Duration = when (type) {
        OutboxEventType.NOTE_INDEX_REQUESTED -> indexLease
        OutboxEventType.NOTE_SUMMARY_REQUESTED -> summaryLease
    }

    private fun withSafetyFactor(duration: Duration): Duration =
        Duration.ofMillis(ceil(duration.toMillis() * safetyFactor).toLong())
}
