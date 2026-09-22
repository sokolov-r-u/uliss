package io.uliss.note_service.policy

import io.uliss.note_service.config.ChatTurnProperties
import org.springframework.ai.retry.autoconfigure.SpringAiRetryProperties
import org.springframework.boot.http.client.HttpClientSettings
import org.springframework.stereotype.Component
import java.time.Duration
import kotlin.math.ceil

@Component
class ChatTurnExecutionPolicy(
    retryProperties: SpringAiRetryProperties,
    httpClientSettings: HttpClientSettings,
    properties: ChatTurnProperties,
) {
    val maxAttempts = properties.maxAttempts
    val lease: Duration = run {
        val connectTimeout = requireNotNull(httpClientSettings.connectTimeout()) {
            "HTTP client connect timeout must be configured"
        }
        val readTimeout = requireNotNull(httpClientSettings.readTimeout()) {
            "HTTP client read timeout must be configured"
        }
        require(maxAttempts > 0) { "chat turn max attempts must be positive" }
        require(retryProperties.maxAttempts > 0) { "chat provider max attempts must be positive" }
        require(!connectTimeout.isNegative) { "HTTP client connect timeout must not be negative" }
        require(!readTimeout.isNegative && !readTimeout.isZero) { "HTTP client read timeout must be positive" }
        require(properties.leaseSafetyFactor >= 1.0) { "chat turn lease safety factor must be at least 1.0" }

        val providerBudget = connectTimeout.plus(readTimeout)
            .multipliedBy(retryProperties.maxAttempts.toLong())
        Duration.ofMillis(ceil(providerBudget.toMillis() * properties.leaseSafetyFactor).toLong())
    }
}
