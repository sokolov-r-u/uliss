package io.uliss.note_service.dto.response

/** What deleting a branch means for notes: [notesToMove] have no place outside it. */
data class ConstellationDeletionResponse(
    val notesToMove: Int,
)
