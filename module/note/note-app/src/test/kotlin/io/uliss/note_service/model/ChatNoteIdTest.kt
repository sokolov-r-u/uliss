package io.uliss.note_service.model

import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals

class ChatNoteIdTest {

    @Test
    fun `equals returns true for same instance`() {
        val id = ChatNoteId(UUID.randomUUID(), UUID.randomUUID())

        assertEquals(id, id)
    }

    @Test
    fun `equals returns true for different instances with same values`() {
        val chatId = UUID.randomUUID()
        val noteId = UUID.randomUUID()

        assertEquals(ChatNoteId(chatId, noteId), ChatNoteId(chatId, noteId))
    }

    @Test
    fun `equals returns false for different chatId`() {
        val noteId = UUID.randomUUID()

        assertNotEquals(ChatNoteId(UUID.randomUUID(), noteId), ChatNoteId(UUID.randomUUID(), noteId))
    }

    @Test
    fun `equals returns false for different noteId`() {
        val chatId = UUID.randomUUID()

        assertNotEquals(ChatNoteId(chatId, UUID.randomUUID()), ChatNoteId(chatId, UUID.randomUUID()))
    }

    @Test
    fun `equals returns false when compared to null`() {
        assertFalse(ChatNoteId(UUID.randomUUID(), UUID.randomUUID()).equals(null))
    }

    @Test
    fun `equals returns false when compared to unrelated type`() {
        assertFalse(ChatNoteId(UUID.randomUUID(), UUID.randomUUID()).equals("not a ChatNoteId"))
    }

    @Test
    fun `hashCode matches for equal instances`() {
        val chatId = UUID.randomUUID()
        val noteId = UUID.randomUUID()

        assertEquals(ChatNoteId(chatId, noteId).hashCode(), ChatNoteId(chatId, noteId).hashCode())
    }
}
