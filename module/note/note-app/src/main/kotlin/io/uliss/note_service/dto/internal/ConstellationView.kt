package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.ConstellationLightness
import java.util.UUID

/** A tree node as drawn: [hue] is the root's, [lightness] is [ConstellationLightness.BASE] for a root. */
data class ConstellationView(
    val id: UUID,
    val parentId: UUID?,
    val name: String,
    val hue: Int,
    val lightness: ConstellationLightness,
    val noteCount: Int,
)
