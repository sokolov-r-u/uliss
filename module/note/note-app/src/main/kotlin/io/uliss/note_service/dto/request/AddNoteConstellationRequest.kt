package io.uliss.note_service.dto.request

import jakarta.validation.constraints.NotNull
import java.util.UUID

data class AddNoteConstellationRequest(
    @field:NotNull
    val constellationId: UUID?,
)
