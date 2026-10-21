package io.uliss.note_service.repository

import java.time.Instant
import java.util.UUID

data class RetrievedChunk(
    val noteId: UUID,
    val chunkIndex: Int,
    val content: String,
    val similarity: Double,
    val noteTitle: String?,
    val noteCreatedAt: Instant,
)
