package io.uliss.note_service.dto.request

import io.uliss.note_service.util.NoteContentNormalizer
import io.uliss.note_service.util.NoteIconNormalizer
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size

/** Transport bounds only; the title and content rules are enforced by the owning service. */
data class UpdateNoteRequest(
    @field:NotBlank
    @field:Size(max = 100)
    val title: String,
    // twice the service limit leaves room for trailing whitespace; stops megabytes before they reach the service
    @field:NotBlank
    @field:Size(max = 2 * NoteContentNormalizer.MAX_CHARS)
    val content: String,
    /** The note's emoji; null or blank removes it. One emoji is enforced by the owning service. */
    @field:Size(max = 2 * NoteIconNormalizer.MAX_CHARS)
    val icon: String? = null,
    /** The note version the edit started from; a newer stored version rejects the edit. */
    @field:NotNull
    val version: Long?,
)
