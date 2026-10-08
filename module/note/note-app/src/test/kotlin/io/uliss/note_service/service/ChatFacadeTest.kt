package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.exception.ChatTurnAlreadyGeneratingException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.service.facade.ChatFacade
import io.uliss.note_service.service.output.AssistantReplyStream
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import reactor.core.publisher.Flux
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertSame

class ChatFacadeTest {

    private val chatService = Mockito.mock(ChatService::class.java)
    private val assistantService = Mockito.mock(AssistantService::class.java)
    private val noteService = Mockito.mock(NoteService::class.java)
    private val chatTurnService = Mockito.mock(ChatTurnService::class.java)
    private val chatFacade = ChatFacade(chatService, assistantService, noteService, chatTurnService)

    @Test
    fun `streamReply creates a missing chat and exposes its backend identity`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val chat = ChatEntity(userId, "hello").apply { id = chatId }
        val assistantReply = AssistantReplyStream(turnId, Flux.empty(), chatId)
        Mockito.`when`(chatService.createChat(userId, idempotencyKey, "hello"))
            .thenReturn(chat)
        Mockito.`when`(assistantService.streamReply(userId, chatId, idempotencyKey, "hello"))
            .thenReturn(assistantReply)

        val result = chatFacade.streamReply(userId, null, idempotencyKey, "hello")

        assertEquals(chatId, result.chatId)
        assertEquals(turnId, result.turnId)
        assertSame(assistantReply.events, result.events)
    }

    @Test
    fun `streamReply requires an existing chat without invoking creation`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val chat = ChatEntity(userId, "hello").apply { id = chatId }
        val assistantReply = AssistantReplyStream(turnId, Flux.empty(), chatId)
        Mockito.`when`(chatService.requireOwnedChat(userId, chatId)).thenReturn(chat)
        Mockito.`when`(assistantService.streamReply(userId, chatId, idempotencyKey, "hello"))
            .thenReturn(assistantReply)

        val result = chatFacade.streamReply(userId, chatId, idempotencyKey, "hello")

        assertSame(assistantReply, result)
        Mockito.verify(chatService, Mockito.never()).createChat(userId, idempotencyKey, "hello")
    }

    @Test
    fun `streamReply never creates a chat when the requested chat is missing`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(chatService.requireOwnedChat(userId, chatId))
            .thenThrow(NotFoundException("chat id=$chatId not found"))

        assertFailsWith<NotFoundException> {
            chatFacade.streamReply(userId, chatId, idempotencyKey, "hello")
        }

        Mockito.verify(chatService, Mockito.never()).createChat(userId, idempotencyKey, "hello")
        Mockito.verifyNoInteractions(assistantService)
    }

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

    @Test
    fun `getChats attaches note counts and defaults missing counts to zero`() {
        val userId = UUID.randomUUID()
        val withNotes = ChatEntity(userId, "With notes")
        val withoutNotes = ChatEntity(userId, "Without notes")
        Mockito.`when`(chatService.getChats(userId)).thenReturn(listOf(withNotes, withoutNotes))
        Mockito.`when`(noteService.getNoteCounts(listOf(withNotes.id, withoutNotes.id)))
            .thenReturn(mapOf(withNotes.id to 2))

        val result = chatFacade.getChats(userId)

        assertEquals(listOf(withNotes, withoutNotes), result.map { it.chat })
        assertEquals(listOf(2, 0), result.map { it.noteCount })
    }

    @Test
    fun `getChat returns an owned chat with its note count`() {
        val userId = UUID.randomUUID()
        val chat = ChatEntity(userId, "Trip planning")
        Mockito.`when`(chatService.requireOwnedChat(userId, chat.id)).thenReturn(chat)
        Mockito.`when`(noteService.getNoteCounts(listOf(chat.id))).thenReturn(mapOf(chat.id to 1))

        val result = chatFacade.getChat(userId, chat.id)

        assertSame(chat, result.chat)
        assertEquals(1, result.noteCount)
    }

    @Test
    fun `renameChat returns the renamed chat with its note count`() {
        val userId = UUID.randomUUID()
        val chat = ChatEntity(userId, "New title")
        Mockito.`when`(chatService.renameChat(userId, chat.id, " New title ")).thenReturn(chat)
        Mockito.`when`(noteService.getNoteCounts(listOf(chat.id))).thenReturn(emptyMap())

        val result = chatFacade.renameChat(userId, chat.id, " New title ")

        assertSame(chat, result.chat)
        assertEquals(0, result.noteCount)
    }

    @Test
    fun `deleteChat locks the chat against live turns before deleting it`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()

        chatFacade.deleteChat(userId, chatId)

        val order = Mockito.inOrder(chatTurnService, chatService)
        order.verify(chatTurnService).lockChatForDeletion(userId, chatId)
        order.verify(chatService).deleteChat(userId, chatId)
        Mockito.verifyNoInteractions(noteService)
    }

    @Test
    fun `deleteChat keeps the chat when a turn is still generating`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.doThrow(ChatTurnAlreadyGeneratingException(chatId, UUID.randomUUID()))
            .`when`(chatTurnService).lockChatForDeletion(userId, chatId)

        assertFailsWith<ChatTurnAlreadyGeneratingException> { chatFacade.deleteChat(userId, chatId) }

        Mockito.verifyNoInteractions(chatService)
    }
}
