package io.uliss.note_service.outbox

import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Min
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.validation.annotation.Validated

@Validated
@ConfigurationProperties("note.outbox")
data class OutboxProperties(
    @field:Min(1)
    val pollIntervalMs: Long = 5_000,
    @field:Min(1)
    val maxAttempts: Int = 3,
    @field:Min(1)
    val concurrency: Int = 4,
    @field:DecimalMin("1.0")
    val leaseSafetyFactor: Double = 1.3,
)
