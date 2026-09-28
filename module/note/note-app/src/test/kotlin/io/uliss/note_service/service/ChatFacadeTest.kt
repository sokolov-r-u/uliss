package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.util.UUID
import kotlin.test.assertFailsWith
import kotlin.test.assertSame

class ChatFacadeTest {

    private val chatService = Mockito.mock(ChatService::class.java)
    private val assistantService = Mockito.mock(AssistantService::class.java)
    private val noteService = Mockito.mock(NoteService::class.java)
    private val chatFacade = ChatFacade(chatService, assistantService, noteService)

    @Test
    fun `requestSummary rejects a chat with no messages`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(null)

        assertFailsWith<BadRequestException> {
            chatFacade.requestSummary(userId, chatId, idempotencyKey)
        }
        Mockito.verifyNoInteractions(noteService)
    }

    @Test
    fun `requestSummary uses the separately loaded latest message as the immutable summary boundary`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val throughMessageId = UUID.randomUUID()
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(throughMessageId)
        val savedNote = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(
            noteService.requestChatSummary(userId, chatId, throughMessageId, idempotencyKey)
        ).thenReturn(savedNote)

        val result = chatFacade.requestSummary(userId, chatId, idempotencyKey)

        assertSame(savedNote, result)
        Mockito.verify(chatService).getLatestMessageId(userId, chatId)
        Mockito.verify(noteService).requestChatSummary(userId, chatId, throughMessageId, idempotencyKey)
    }
}
