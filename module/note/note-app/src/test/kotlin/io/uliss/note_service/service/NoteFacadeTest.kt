package io.uliss.note_service.service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.service.facade.NoteFacade
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class NoteFacadeTest {

    private val noteService = Mockito.mock(NoteService::class.java)
    private val chatService = Mockito.mock(ChatService::class.java)
    private val noteFacade = NoteFacade(noteService, chatService)

    @Test
    fun `note chats keep the chat order and default missing note counts to zero`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        val first = ChatEntity(userId, "First")
        val second = ChatEntity(userId, "Second")
        Mockito.`when`(noteService.getLinkedChatIds(userId, noteId)).thenReturn(listOf(second.id, first.id))
        Mockito.`when`(chatService.getChatsByIds(userId, listOf(second.id, first.id))).thenReturn(listOf(first, second))
        Mockito.`when`(noteService.getNoteCounts(listOf(first.id, second.id))).thenReturn(mapOf(first.id to 2))

        val result = noteFacade.getNoteChats(userId, noteId)

        assertEquals(listOf(first, second), result.map { it.chat })
        assertEquals(listOf(2, 0), result.map { it.noteCount })
    }

    @Test
    fun `note chats of a missing note are not found without reading chats`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteService.getLinkedChatIds(userId, noteId)).thenThrow(NotFoundException("note not found"))

        assertFailsWith<NotFoundException> { noteFacade.getNoteChats(userId, noteId) }
        Mockito.verify(chatService, Mockito.never()).getChatsByIds(anyValue(), anyValue())
    }
}
