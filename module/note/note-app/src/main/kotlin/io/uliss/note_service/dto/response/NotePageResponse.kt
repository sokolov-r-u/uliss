package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.NoteListPage

data class NotePageResponse(
    val items: List<NoteResponse>,
    val nextCursor: String?,
    val total: Int,
)

fun NoteListPage.toResponse() = NotePageResponse(notes.items, notes.nextCursor?.encode(), total)
