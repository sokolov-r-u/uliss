package io.uliss.note_service.dto.internal

import org.junit.jupiter.api.Test
import org.springframework.ai.converter.BeanOutputConverter
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class NoteBodyDraftTest {

    @Test
    fun `toNoteContent joins the thoughts like a full draft and fails without a main thought`() {
        assertEquals(
            "Main.\n\n- One\n- Two",
            NoteBodyDraft(" Main. ", listOf("- One", "Two\n")).toNoteContent(),
        )
        assertFailsWith<IllegalStateException> { NoteBodyDraft("  ", listOf("Orphan")).toNoteContent() }
    }

    @Test
    fun `NoteBodyDraft schema has the body fields of NoteDraft and no title, all required for strict mode`() {
        val schema = BeanOutputConverter(NoteBodyDraft::class.java).jsonSchemaMap
        val full = BeanOutputConverter(NoteDraft::class.java).jsonSchemaMap

        @Suppress("UNCHECKED_CAST")
        val properties = schema["properties"] as Map<String, Any>
        @Suppress("UNCHECKED_CAST")
        val fullProperties = full["properties"] as Map<String, Any>
        assertEquals(setOf("mainThought", "secondaryThoughts"), properties.keys)
        assertEquals(properties.keys, (schema["required"] as List<*>).toSet())
        assertEquals(false, schema["additionalProperties"])
        assertEquals(fullProperties["mainThought"], properties["mainThought"])
        assertEquals(fullProperties["secondaryThoughts"], properties["secondaryThoughts"])
    }
}
