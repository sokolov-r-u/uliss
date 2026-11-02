package io.uliss.note_service.dto.internal

import org.junit.jupiter.api.Test
import org.springframework.ai.converter.BeanOutputConverter
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NoteAddendumDraftTest {

    @Test
    fun `toAddendumContent formats new thoughts like a note body`() {
        val draft = NoteAddendumDraft(false, "  New paragraph.  ", listOf("- One.", " ", "Two."))

        assertEquals("New paragraph.\n\n- One.\n- Two.", draft.toAddendumContent())
    }

    @Test
    fun `toAddendumContent is null only when the model reports nothing new`() {
        assertNull(NoteAddendumDraft(true, "Ignored.", emptyList()).toAddendumContent())
    }

    @Test
    fun `toAddendumContent fails without a main thought so the update is retried`() {
        assertFailsWith<IllegalStateException> { NoteAddendumDraft(false, "  ", listOf("Orphan.")).toAddendumContent() }
        assertFailsWith<IllegalStateException> { NoteAddendumDraft(null, null, null).toAddendumContent() }
    }

    @Test
    fun `schema requires every field and carries the field rules`() {
        val schema = BeanOutputConverter(NoteAddendumDraft::class.java).jsonSchemaMap

        @Suppress("UNCHECKED_CAST")
        val properties = schema["properties"] as Map<String, Map<String, Any>>
        assertEquals(setOf("nothingNew", "mainThought", "secondaryThoughts"), properties.keys)
        assertEquals(properties.keys, (schema["required"] as List<*>).toSet())
        val mainDescription = properties.getValue("mainThought")["description"] as String
        assertTrue(mainDescription.contains("do not use headings"))
        assertTrue(mainDescription.contains("does not list other works"))
        assertTrue(mainDescription.contains("about the existing note's subject"))
        val secondaryDescription = properties.getValue("secondaryThoughts")["description"] as String
        assertTrue(secondaryDescription.contains("No fixed limit"))
        assertTrue(secondaryDescription.contains("Not passing remarks"))
        assertTrue(secondaryDescription.contains("never repeats the main thought"))
        assertTrue(secondaryDescription.contains("One topic per item"))
        // a long item opens with its topic in bold so the list can be skimmed; a short one does not
        assertTrue(secondaryDescription.contains("starts with a short bold label naming its topic"))
        assertTrue(secondaryDescription.contains("not a question the user asked for information and got answered"))
    }
}
