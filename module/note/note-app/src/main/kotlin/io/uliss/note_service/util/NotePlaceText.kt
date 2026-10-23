package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.NotePlaceDescription

/** The note's place and name as text, shared by the summary prompts and the RAG index header. */
object NotePlaceText {

    /** Every constellation path, root first: `Music / Jazz; Cinema`; empty without constellations. */
    fun constellations(place: NotePlaceDescription): String =
        place.constellationPaths.joinToString("; ") { it.joinToString(" / ") }

    /** The note's name as the user sees it: `🎷 Giant Steps`; null when it has neither. */
    fun titleWithIcon(title: String?, icon: String?): String? =
        listOfNotNull(icon, title).joinToString(" ").ifEmpty { null }

    /** Parent notes from the top one down: `"Jazz history" / (untitled)`; empty for a top note. */
    fun parentNotes(place: NotePlaceDescription): String =
        place.parentNoteTitles.joinToString(" / ") { title -> title?.let { "\"$it\"" } ?: "(untitled)" }
}
