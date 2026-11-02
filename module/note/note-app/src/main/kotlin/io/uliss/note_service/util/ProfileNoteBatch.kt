package io.uliss.note_service.util

import io.uliss.note_service.model.projection.ProfileNote

/** Cuts the notes the profile reads into batches that fit one model call. */
object ProfileNoteBatch {

    /** The characters a note costs in a batch: its title and text. */
    fun size(note: ProfileNote): Int = (note.title?.length ?: 0) + note.content.length

    /**
     * The leading notes of [notes] that fit [maxChars] together. A first note longer than the budget comes alone, cut
     * from its end, so every batch reads at least one note.
     */
    fun take(notes: List<ProfileNote>, maxChars: Int): List<ProfileNote> {
        val first = notes.firstOrNull() ?: return emptyList()
        if (size(first) > maxChars) return listOf(cut(first, maxChars))
        var used = 0
        return notes.takeWhile { note ->
            used += size(note)
            used <= maxChars
        }
    }

    private fun cut(note: ProfileNote, maxChars: Int): ProfileNote {
        val title = note.title?.take(maxChars)
        return note.copy(title = title, content = note.content.take(maxChars - (title?.length ?: 0)))
    }
}
