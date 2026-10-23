package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.NotePlaceDescription
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class NoteIndexHeaderTest {

    @Test
    fun `the header lists every constellation path, the parent notes from the top down and the title`() {
        val place = NotePlaceDescription(
            constellationPaths = listOf(listOf("Music", "Jazz"), listOf("Cinema")),
            parentNoteTitles = listOf("Jazz history", null),
        )

        assertEquals(
            "Constellations: Music / Jazz; Cinema\n" +
                "Parent notes: \"Jazz history\" / (untitled)\n" +
                "Title: Giant Steps",
            NoteIndexHeader.render(place, "Giant Steps"),
        )
    }

    @Test
    fun `the user's icon stands before the title`() {
        val place = NotePlaceDescription(listOf(listOf("Music")), emptyList())

        assertEquals(
            "Constellations: Music\nTitle: 🎷 Giant Steps",
            NoteIndexHeader.render(place, "Giant Steps", "🎷"),
        )
        assertEquals("Title: 🎷", NoteIndexHeader.render(NotePlaceDescription(emptyList(), emptyList()), null, "🎷"))
    }

    @Test
    fun `a note without a place gets only its title`() {
        assertEquals("Title: Loose", NoteIndexHeader.render(NotePlaceDescription(emptyList(), emptyList()), "Loose"))
    }

    @Test
    fun `a sub-note whose top note has no constellation gets only its parents`() {
        val place = NotePlaceDescription(emptyList(), listOf("Coltrane"))

        assertEquals("Parent notes: \"Coltrane\"", NoteIndexHeader.render(place, "  "))
    }

    @Test
    fun `an untitled note without a place has no header`() {
        assertEquals("", NoteIndexHeader.render(NotePlaceDescription(emptyList(), emptyList()), null))
    }
}
