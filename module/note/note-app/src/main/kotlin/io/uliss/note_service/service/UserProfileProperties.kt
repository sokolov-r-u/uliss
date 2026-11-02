package io.uliss.note_service.service

import jakarta.validation.constraints.Min
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.validation.annotation.Validated
import java.time.Duration

@Validated
@ConfigurationProperties("note.profile")
data class UserProfileProperties(
    /** When the nightly refresh queues its events (UTC). */
    val refreshCron: String = "0 0 3 * * *",
    /** A note changed this recently waits for the next run: a commit in flight may carry an older `updated_at`. */
    val settleDelay: Duration = Duration.ofMinutes(5),
    /** Over this length the updated profile is compacted. */
    @field:Min(1)
    val maxChars: Int = 8_000,
    /** The length the compact prompt aims at. */
    @field:Min(1)
    val compactTargetChars: Int = 5_000,
    /** The note text one model call reads at most. */
    @field:Min(1)
    val batchMaxChars: Int = 60_000,
    /** The notes one batch query fetches at most. */
    @field:Min(1)
    val batchMaxNotes: Int = 200,
    /** OpenAI per-call options for the profile calls; passed to the provider as-is. */
    val reasoningEffort: String = "medium",
    val verbosity: String = "medium",
)
