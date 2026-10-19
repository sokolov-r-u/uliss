package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.ConstellationLightness
import java.util.UUID

/**
 * A tree node as drawn: [hue] is the root's, [lightness] is [ConstellationLightness.BASE] for a root. [noteCount] counts
 * distinct notes of the whole subtree, [ownNoteCount] those of the node itself.
 */
data class ConstellationView(
    val id: UUID,
    val parentId: UUID?,
    val name: String,
    val hue: Int,
    val lightness: ConstellationLightness,
    val noteCount: Int,
    val ownNoteCount: Int,
)
