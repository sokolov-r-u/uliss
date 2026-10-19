package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.ConstellationView
import io.uliss.note_service.model.ConstellationLightness
import java.util.UUID

/** A tree node; [hue] is inherited from the root, [lightness] is `BASE` for a root. */
data class ConstellationResponse(
    val id: UUID,
    val parentId: UUID?,
    val name: String,
    val hue: Int,
    val lightness: ConstellationLightness,
    val noteCount: Int,
)

fun ConstellationView.toResponse() = ConstellationResponse(id, parentId, name, hue, lightness, noteCount)
