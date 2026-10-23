package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.NotePlaceDescription

/**
 * The header every RAG chunk of a note starts with, so the note's place and title shape the embedding of each chunk,
 * not only of the first. The title line starts with the user's icon. Lines without data are left out; a note with
 * neither place nor title nor icon has no header.
 */
object NoteIndexHeader {

    fun render(place: NotePlaceDescription, title: String?, icon: String? = null): String = listOfNotNull(
        NotePlaceText.constellations(place).ifEmpty { null }?.let { "Constellations: $it" },
        NotePlaceText.parentNotes(place).ifEmpty { null }?.let { "Parent notes: $it" },
        NotePlaceText.titleWithIcon(title?.takeIf { it.isNotBlank() }, icon)?.let { "Title: $it" },
    ).joinToString("\n")
}
