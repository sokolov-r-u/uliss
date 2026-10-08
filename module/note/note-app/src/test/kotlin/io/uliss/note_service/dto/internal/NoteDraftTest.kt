package io.uliss.note_service.dto.internal

import org.junit.jupiter.api.Test
import org.springframework.ai.converter.BeanOutputConverter
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class NoteDraftTest {

    @Test
    fun `toNoteContent joins the main thought and secondary thoughts into one note`() {
        val draft = NoteDraft(
            "Night city",
            "  First paragraph.\n\nSecond paragraph.  ",
            listOf(" Same reason applies.\n ", "   ", "Listen to the album."),
        )

        assertEquals(
            "First paragraph.\n\nSecond paragraph.\n\n- Same reason applies.\n- Listen to the album.",
            draft.toNoteContent(),
        )
    }

    @Test
    fun `toNoteContent keeps at most three secondary thoughts`() {
        val draft = NoteDraft("Title", "Main.", listOf("One", "Two", "Three", "Four"))

        assertEquals("Main.\n\n- One\n- Two\n- Three", draft.toNoteContent())
    }

    @Test
    fun `toNoteContent returns only the main thought without secondary thoughts`() {
        assertEquals("Main.", NoteDraft("Title", " Main. ", null).toNoteContent())
        assertEquals("Main.", NoteDraft("Title", "Main.", listOf(" ", "")).toNoteContent())
    }

    @Test
    fun `toNoteContent fails on a missing or blank main thought`() {
        assertFailsWith<IllegalStateException> { NoteDraft("Title", null, listOf("Orphan")).toNoteContent() }
        assertFailsWith<IllegalStateException> { NoteDraft("Title", "   ", listOf("Orphan")).toNoteContent() }
    }

    @Test
    fun `NoteDraft is readable by the structured output converter`() {
        val converter = BeanOutputConverter(NoteDraft::class.java)

        val draft = converter.convert(
            "```json\n{\"title\": \"Ownership\", \"mainThought\": \"Keep user_id.\", " +
                    "\"secondaryThoughts\": [\"Check retries.\"]}\n```"
        )

        assertEquals(NoteDraft("Ownership", "Keep user_id.", listOf("Check retries.")), draft)
    }

    @Test
    fun `NoteDraft schema satisfies OpenAI strict structured outputs`() {
        val schema = BeanOutputConverter(NoteDraft::class.java).jsonSchemaMap

        @Suppress("UNCHECKED_CAST")
        val properties = schema["properties"] as Map<String, Any>
        assertEquals(properties.keys, (schema["required"] as List<*>).toSet())
        assertEquals(false, schema["additionalProperties"])
    }

    @Test
    fun `NoteDraft schema exposes only the model fields with their instructions`() {
        val schema = BeanOutputConverter(NoteDraft::class.java).jsonSchemaMap

        @Suppress("UNCHECKED_CAST")
        val properties = schema["properties"] as Map<String, Map<String, Any>>
        assertEquals(setOf("title", "mainThought", "secondaryThoughts"), properties.keys)
        val titleDescription = properties.getValue("title")["description"] as String
        val mainDescription = properties.getValue("mainThought")["description"] as String
        val secondaryDescription = properties.getValue("secondaryThoughts")["description"] as String
        assertTrue(titleDescription.contains("at most 50 characters"))
        assertTrue(titleDescription.contains("names the main thought"))
        assertTrue(mainDescription.contains("do not repeat it here"))
        assertTrue(mainDescription.contains("one or more paragraphs"))
        assertTrue(secondaryDescription.contains("only inline formatting"))
        assertTrue(secondaryDescription.contains("At most three"))
        assertTrue(secondaryDescription.contains("fewer is better"))
        assertTrue(secondaryDescription.contains("Put open questions and intentions last"))
        assertEquals("A standalone note capturing the user's thoughts from the current chat.", schema["description"])
    }
}
