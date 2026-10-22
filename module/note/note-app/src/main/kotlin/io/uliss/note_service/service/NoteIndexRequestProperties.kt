package io.uliss.note_service.service

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

@ConfigurationProperties("note.rag")
data class NoteIndexRequestProperties(
    // a reindex of a changed note waits this long after its last change
    val reindexDelay: Duration = Duration.ofHours(1),
)
