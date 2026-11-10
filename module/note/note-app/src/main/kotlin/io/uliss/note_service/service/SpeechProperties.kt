package io.uliss.note_service.service

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.util.unit.DataSize
import java.time.Duration

/** Dictation limits: the browser stops recording at [maxDuration]; the server only checks [maxFileSize]. */
@ConfigurationProperties("note.speech")
data class SpeechProperties(
    val maxDuration: Duration = Duration.ofMinutes(5),
    val maxFileSize: DataSize = DataSize.ofMegabytes(10),
    /** Transcriptions in flight per instance; each holds its recording in memory, so this bounds the heap they take. */
    val maxConcurrent: Int = 4,
) {
    init {
        // zero would start fine and then refuse every recording
        require(maxConcurrent >= 1) { "note.speech.max-concurrent must be at least 1: $maxConcurrent" }
    }
}
