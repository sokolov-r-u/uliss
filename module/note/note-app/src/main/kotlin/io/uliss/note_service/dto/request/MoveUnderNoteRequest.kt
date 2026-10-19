package io.uliss.note_service.dto.request

import jakarta.validation.constraints.NotNull
import java.util.UUID

data class MoveUnderNoteRequest(
    @field:NotNull
    val parentNoteId: UUID?,
)
