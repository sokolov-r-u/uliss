package io.uliss.note_service.dto.request

import io.uliss.note_service.util.NoteContentNormalizer
import io.uliss.note_service.util.NoteIconNormalizer
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/** Transport bounds only, as in [UpdateNoteRequest]; the title, content and icon rules are the owning service's. */
data class CreateNoteRequest(
    @field:NotBlank
    @field:Size(max = 100)
    val title: String,
    // twice the service limit leaves room for trailing whitespace; stops megabytes before they reach the service
    @field:NotBlank
    @field:Size(max = 2 * NoteContentNormalizer.MAX_CHARS)
    val content: String,
    /** The note's emoji; null or blank means none. */
    @field:Size(max = 2 * NoteIconNormalizer.MAX_CHARS)
    val icon: String? = null,
)
