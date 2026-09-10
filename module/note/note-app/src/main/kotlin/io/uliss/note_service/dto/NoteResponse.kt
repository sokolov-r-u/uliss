package io.uliss.note_service.dto

import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import java.time.Instant
import java.util.UUID

data class NoteResponse(
    val id: UUID,
    val source: NoteSource,
    val status: NoteStatus,
    val content: String?,
    val createdAt: Instant?,
    val updatedAt: Instant?,
)

data class NoteStatusResponse(
    val noteId: UUID,
    val status: NoteStatus,
    val updatedAt: Instant?,
)

fun NoteEntity.toResponse() = NoteResponse(
    id = id,
    source = source,
    status = status,
    content = content,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun NoteEntity.toStatusResponse(): NoteStatusResponse =
    NoteStatusResponse(id, status, updatedAt)
