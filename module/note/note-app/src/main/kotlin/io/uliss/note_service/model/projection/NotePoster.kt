package io.uliss.note_service.model.projection

import io.uliss.note_service.model.payload.PosterCrop

/** A row of `note.note_posters`: the link and its crop frames, null for the centred defaults. */
data class NotePoster(
    val url: String,
    val crop: PosterCrop?,
)
