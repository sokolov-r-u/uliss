package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
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

    private fun history(chatId: UUID) = listOf(
        ChatMessageEntity(chatId, ChatMessageRole.USER, "hi", ChatMessageStatus.COMPLETE),
        ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "hello", ChatMessageStatus.COMPLETE),
    )

    @Test
    fun `requestSummary rejects a chat with no messages`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatService.getMessages(userId, chatId)).thenReturn(emptyList())

        assertFailsWith<BadRequestException> {
            chatFacade.requestSummary(userId, chatId)
        }
        Mockito.verifyNoInteractions(noteService)
    }

    @Test
    fun `requestSummary uses the last message as the immutable summary boundary`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val history = history(chatId)
        val throughMessageId = history.last().id
        Mockito.`when`(chatService.getMessages(userId, chatId)).thenReturn(history)
        val savedNote = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteService.requestChatSummary(userId, chatId, throughMessageId)).thenReturn(savedNote)

        val result = chatFacade.requestSummary(userId, chatId)

        assertSame(savedNote, result)
        Mockito.verify(noteService).requestChatSummary(userId, chatId, throughMessageId)
    }
}
