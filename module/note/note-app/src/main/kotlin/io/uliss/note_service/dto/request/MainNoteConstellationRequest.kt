package io.uliss.note_service.dto.request

import jakarta.validation.constraints.NotNull
import java.util.UUID

/** Makes [constellationId] the note's main place; [replace] drops the previous main instead of keeping it. */
data class MainNoteConstellationRequest(
    @field:NotNull
    val constellationId: UUID?,
    val replace: Boolean = false,
)
