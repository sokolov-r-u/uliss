package io.uliss.note_service.service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertSame

class ChatServiceTest {

    private val chatRepository = Mockito.mock(ChatRepository::class.java)
    private val chatMessageRepository = Mockito.mock(ChatMessageRepository::class.java)
    private val chatService = ChatService(chatRepository, chatMessageRepository)

    @Test
    fun `createChat uses the given title`() {
        val userId = UUID.randomUUID()
        Mockito.`when`(chatRepository.save(anyValue())).thenAnswer { it.getArgument<ChatEntity>(0) }

        val result = chatService.createChat(userId, "Trip planning")

        assertEquals("Trip planning", result.title)
        assertEquals(userId, result.userId)
    }

    @Test
    fun `createChat falls back to a default title when null`() {
        val userId = UUID.randomUUID()
        Mockito.`when`(chatRepository.save(anyValue())).thenAnswer { it.getArgument<ChatEntity>(0) }

        val result = chatService.createChat(userId, null)

        assertEquals("New chat", result.title)
    }

    @Test
    fun `createChat falls back to a default title when blank`() {
        val userId = UUID.randomUUID()
        Mockito.`when`(chatRepository.save(anyValue())).thenAnswer { it.getArgument<ChatEntity>(0) }

        val result = chatService.createChat(userId, "   ")

        assertEquals("New chat", result.title)
    }

    @Test
    fun `getChats delegates to the repository`() {
        val userId = UUID.randomUUID()
        val chat = ChatEntity(userId, "Trip planning")
        Mockito.`when`(chatRepository.findByUserIdOrderByCreatedAtDesc(userId)).thenReturn(listOf(chat))

        val result = chatService.getChats(userId)

        assertSame(chat, result.single())
    }

    @Test
    fun `getMessages returns ordered history for an owned chat`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val chat = ChatEntity(userId, "Trip planning")
        val message = ChatMessageEntity(chatId, ChatMessageRole.USER, "hi", ChatMessageStatus.COMPLETE)
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId)).thenReturn(chat)
        Mockito.`when`(chatMessageRepository.findByChatIdOrderByCreatedAtAsc(chatId)).thenReturn(listOf(message))

        val result = chatService.getMessages(userId, chatId)

        assertSame(message, result.single())
    }

    @Test
    fun `getMessages throws NotFoundException when the chat is not owned by the user`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId)).thenReturn(null)

        assertFailsWith<NotFoundException> {
            chatService.getMessages(userId, chatId)
        }
    }

    @Test
    fun `appendUserMessage saves the user message and returns it appended to prior history`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val chat = ChatEntity(userId, "Trip planning")
        val priorMessage = ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "hello", ChatMessageStatus.COMPLETE)
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId)).thenReturn(chat)
        Mockito.`when`(chatMessageRepository.findByChatIdOrderByCreatedAtAsc(chatId)).thenReturn(listOf(priorMessage))
        Mockito.`when`(chatMessageRepository.save(anyValue()))
            .thenAnswer { it.getArgument<ChatMessageEntity>(0) }

        val result = chatService.appendUserMessage(userId, chatId, "what's next?")

        assertEquals(2, result.size)
        assertSame(priorMessage, result[0])
        assertEquals(ChatMessageRole.USER, result[1].role)
        assertEquals("what's next?", result[1].content)
        assertEquals(ChatMessageStatus.COMPLETE, result[1].status)
    }

    @Test
    fun `appendUserMessage throws NotFoundException and saves nothing for a foreign chat`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId)).thenReturn(null)

        assertFailsWith<NotFoundException> {
            chatService.appendUserMessage(userId, chatId, "hi")
        }
        Mockito.verify(chatMessageRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `persistAssistantReply saves the given content and status`() {
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatMessageRepository.save(anyValue()))
            .thenAnswer { it.getArgument<ChatMessageEntity>(0) }

        val result = chatService.persistAssistantReply(chatId, "partial answer", ChatMessageStatus.PARTIAL)

        assertEquals(ChatMessageRole.ASSISTANT, result.role)
        assertEquals("partial answer", result.content)
        assertEquals(ChatMessageStatus.PARTIAL, result.status)
    }
}
