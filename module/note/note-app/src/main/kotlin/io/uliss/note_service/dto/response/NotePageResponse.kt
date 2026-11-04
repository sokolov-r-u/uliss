package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.NoteListPage

/** A page of the note list; [total] is the size of the (filtered) list, [allTotal] the number of all the user's notes. */
data class NotePageResponse(
    val items: List<NoteResponse>,
    val nextCursor: String?,
    val total: Int,
    val allTotal: Int,
)

fun NoteListPage.toResponse() = NotePageResponse(notes.items, notes.nextCursor?.encode(), total, allTotal)
