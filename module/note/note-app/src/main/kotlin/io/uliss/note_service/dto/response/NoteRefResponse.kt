package io.uliss.note_service.dto.response

import io.uliss.note_service.model.projection.NoteNode
import java.util.UUID

/** A note named in a path: a parent note of the place or of a search hit. */
data class NoteRefResponse(
    val id: UUID,
    val title: String?,
)

fun NoteNode.toRefResponse() = NoteRefResponse(id, title)
