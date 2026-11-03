package io.uliss.note_service.dto.internal

import io.uliss.note_service.dto.response.NoteResponse

/** A page of the user's notes and the number of all of them, for the list's counter. */
data class NoteListPage(val notes: KeysetPage<NoteResponse>, val total: Int)
