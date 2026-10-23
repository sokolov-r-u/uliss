package io.uliss.note_service.dto.response

import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import java.time.Instant
import java.util.UUID

data class NoteResponse(
    val id: UUID,
    val source: NoteSource,
    val status: NoteStatus,
    val title: String?,
    val content: String?,
    val createdAt: Instant?,
    val updatedAt: Instant?,
    /** A READY note whose summary update is still running; its content changes once the update is applied. */
    val updating: Boolean,
    /** Optimistic-lock version; an edit sends it back so a newer stored version rejects the edit. */
    val version: Long?,
    /** The note this sub-note lives under; null for a top note. */
    val parentNoteId: UUID? = null,
    /** The user's emoji shown before the title. */
    val icon: String? = null,
)

data class NoteStatusResponse(
    val noteId: UUID,
    val status: NoteStatus,
    val updatedAt: Instant?,
    val updating: Boolean,
)

fun NoteEntity.toResponse(updating: Boolean) = NoteResponse(
    id = id,
    source = source,
    status = status,
    title = title,
    content = content,
    createdAt = createdAt,
    updatedAt = updatedAt,
    updating = updating,
    version = version,
    parentNoteId = parentNoteId,
    icon = icon,
)

