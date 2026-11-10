package io.uliss.note_service.dto.response

import io.uliss.note_service.model.payload.CropFrame
import io.uliss.note_service.model.projection.NotePoster

/** A star's poster as the sky draws it: the link and the avatar's circle (null: the centred default). */
data class SkyPosterResponse(
    val url: String,
    val avatar: CropFrame?,
)

fun NotePoster.toSkyResponse() = SkyPosterResponse(url, crop?.avatar)
