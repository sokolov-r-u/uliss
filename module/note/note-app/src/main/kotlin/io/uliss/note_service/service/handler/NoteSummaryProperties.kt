package io.uliss.note_service.service.handler

import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Min
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.validation.annotation.Validated

@Validated
@ConfigurationProperties("note.summary")
data class NoteSummaryProperties(
    @field:Min(1)
    val retrievalQueryMaxChars: Int = 8_000,
    @field:Min(1)
    val retrievalTopK: Int = 5,
    @field:DecimalMin("0.0")
    @field:DecimalMax("1.0")
    val retrievalMinSimilarity: Double = 0.50,
    /** OpenAI per-call options for the summary call; passed to the provider as-is. */
    val reasoningEffort: String = "medium",
    val verbosity: String = "low",
)
