package io.uliss.note_service.dto.response

import io.uliss.note_service.model.payload.PosterCrop
import io.uliss.note_service.model.projection.NotePoster

/** The note's poster: an https link the browser loads, and its crop frames (null: centred defaults). */
data class NotePosterResponse(
    val url: String,
    val crop: PosterCrop?,
)

fun NotePoster.toResponse() = NotePosterResponse(url, crop)
