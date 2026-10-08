package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
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
import org.springframework.data.domain.PageRequest
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertSame

class ChatServiceTest {

    private val chatRepository = Mockito.mock(ChatRepository::class.java)
    private val chatMessageRepository = Mockito.mock(ChatMessageRepository::class.java)
    private val chatService = ChatService(chatRepository, chatMessageRepository)

    @Test
    fun `createChat derives the title and returns the persisted chat`() {
        val userId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val persistedChat = ChatEntity(userId, "persisted").apply { id = UUID.randomUUID() }
        var insertedTitle: String? = null
        Mockito.`when`(
            chatRepository.insertChatOnConflictDoNothing(anyValue(), anyValue(), anyValue(), anyValue())
        ).thenAnswer {
            assertEquals(userId, it.getArgument(1))
            assertEquals(idempotencyKey, it.getArgument(2))
            insertedTitle = it.getArgument(3)
            1
        }
        Mockito.`when`(chatRepository.findByUserIdAndIdempotencyKey(userId, idempotencyKey))
            .thenReturn(persistedChat)

        val result = chatService.createChat(
            userId,
            idempotencyKey,
            "  Explain PostgreSQL locks\nwithout jargon  ",
        )

        assertSame(persistedChat, result)
        assertEquals("Explain PostgreSQL locks", insertedTitle)
    }

    @Test
    fun `createChat returns the original chat when the idempotent insert loses the conflict`() {
        val userId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val originalChat = ChatEntity(userId, "Original title").apply { id = UUID.randomUUID() }
        Mockito.`when`(
            chatRepository.insertChatOnConflictDoNothing(anyValue(), anyValue(), anyValue(), anyValue())
        ).thenReturn(0)
        Mockito.`when`(chatRepository.findByUserIdAndIdempotencyKey(userId, idempotencyKey))
            .thenReturn(originalChat)

        val result = chatService.createChat(userId, idempotencyKey, "Changed retry content")

        assertSame(originalChat, result)
        assertEquals("Original title", result.title)
        Mockito.verify(chatRepository).findByUserIdAndIdempotencyKey(userId, idempotencyKey)
    }

    @Test
    fun `createChat truncates a Unicode title to 50 code points including ellipsis`() {
        val userId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val persistedChat = ChatEntity(userId, "persisted")
        var insertedTitle: String? = null
        Mockito.`when`(
            chatRepository.insertChatOnConflictDoNothing(anyValue(), anyValue(), anyValue(), anyValue())
        ).thenAnswer {
            insertedTitle = it.getArgument(3)
            1
        }
        Mockito.`when`(chatRepository.findByUserIdAndIdempotencyKey(userId, idempotencyKey))
            .thenReturn(persistedChat)

        chatService.createChat(userId, idempotencyKey, "${"😀".repeat(48)} tail")

        val title = checkNotNull(insertedTitle)
        assertEquals("${"😀".repeat(47)}...", title)
        assertEquals(50, title.codePointCount(0, title.length))
    }

    @Test
    fun `createChat fails when the repository cannot recover the persisted result`() {
        val userId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()

        assertFailsWith<IllegalStateException> {
            chatService.createChat(userId, idempotencyKey, "hello")
        }
        Mockito.verify(chatRepository).findByUserIdAndIdempotencyKey(userId, idempotencyKey)
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
    fun `renameChat stores the normalized title`() {
        val userId = UUID.randomUUID()
        val chat = ChatEntity(userId, "Old")
        Mockito.`when`(chatRepository.findByIdAndUserId(chat.id, userId)).thenReturn(chat)
        Mockito.`when`(chatRepository.save(chat)).thenReturn(chat)

        val result = chatService.renameChat(userId, chat.id, "  New   title ")

        assertEquals("New title", result.title)
        Mockito.verify(chatRepository).save(chat)
    }

    @Test
    fun `renameChat rejects an invalid title before loading the chat`() {
        assertFailsWith<BadRequestException> {
            chatService.renameChat(UUID.randomUUID(), UUID.randomUUID(), "   ")
        }
        Mockito.verifyNoInteractions(chatRepository)
    }

    @Test
    fun `renameChat hides a missing or foreign chat behind not found`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId)).thenReturn(null)

        assertFailsWith<NotFoundException> { chatService.renameChat(userId, chatId, "Title") }
    }

    @Test
    fun `deleteChat deletes an owned chat`() {
        val userId = UUID.randomUUID()
        val chat = ChatEntity(userId, "Trip planning")
        Mockito.`when`(chatRepository.findByIdAndUserId(chat.id, userId)).thenReturn(chat)

        chatService.deleteChat(userId, chat.id)

        Mockito.verify(chatRepository).delete(chat)
    }

    @Test
    fun `deleteChat hides a missing or foreign chat behind not found`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId)).thenReturn(null)

        assertFailsWith<NotFoundException> { chatService.deleteChat(userId, chatId) }
        Mockito.verify(chatRepository, Mockito.never()).delete(anyValue())
    }

    @Test
    fun `getMessages returns a chronological latest page and uses the extra row as hasMore`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val chat = ChatEntity(userId, "Trip planning")
        val oldest = message(chatId, "oldest")
        val middle = message(chatId, "middle")
        val newest = message(chatId, "newest")
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId)).thenReturn(chat)
        Mockito.`when`(chatMessageRepository.findLatestPage(chatId, PageRequest.of(0, 3)))
            .thenReturn(listOf(newest, middle, oldest))

        val result = chatService.getMessages(userId, chatId, before = null, limit = 2)

        assertEquals(listOf(middle, newest), result.messages)
        assertEquals(middle.id, result.nextCursor)
        assertEquals(true, result.hasMore)
    }

    @Test
    fun `getMessages applies an exclusive cursor and marks the end of history`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val before = UUID.randomUUID()
        val oldest = message(chatId, "oldest")
        val newer = message(chatId, "newer")
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId))
            .thenReturn(ChatEntity(userId, "Trip planning"))
        Mockito.`when`(chatMessageRepository.findPageBefore(chatId, before, PageRequest.of(0, 3)))
            .thenReturn(listOf(newer, oldest))

        val result = chatService.getMessages(userId, chatId, before, limit = 2)

        assertEquals(listOf(oldest, newer), result.messages)
        assertEquals(null, result.nextCursor)
        assertEquals(false, result.hasMore)
    }

    @Test
    fun `getMessages returns an empty terminal page`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId))
            .thenReturn(ChatEntity(userId, "Trip planning"))
        Mockito.`when`(chatMessageRepository.findLatestPage(chatId, PageRequest.of(0, 51)))
            .thenReturn(emptyList())

        val result = chatService.getMessages(userId, chatId, before = null, limit = 50)

        assertEquals(emptyList(), result.messages)
        assertEquals(null, result.nextCursor)
        assertEquals(false, result.hasMore)
    }

    @Test
    fun `getSummaryContext returns the owned chat title and messages only through the boundary`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val chat = ChatEntity(userId, "Trip planning")
        val first = ChatMessageEntity(chatId, ChatMessageRole.USER, "first", ChatMessageStatus.COMPLETE)
        val boundary = ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "second", ChatMessageStatus.COMPLETE)
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId)).thenReturn(chat)
        Mockito.`when`(chatMessageRepository.findThroughMessage(chatId, boundary.id))
            .thenReturn(listOf(first, boundary))

        val result = chatService.getSummaryContext(userId, chatId, boundary.id)

        assertEquals("Trip planning", result.title)
        assertEquals(listOf(first, boundary), result.messages)
    }

    @Test
    fun `getSummaryContext rejects a boundary that does not belong to the chat`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId))
            .thenReturn(ChatEntity(userId, "Trip planning"))
        val throughMessageId = UUID.randomUUID()
        Mockito.`when`(chatMessageRepository.findThroughMessage(chatId, throughMessageId))
            .thenReturn(emptyList())

        assertFailsWith<IllegalStateException> {
            chatService.getSummaryContext(userId, chatId, throughMessageId)
        }
    }

    @Test
    fun `getMessages throws NotFoundException when the chat is not owned by the user`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId)).thenReturn(null)

        assertFailsWith<NotFoundException> {
            chatService.getMessages(userId, chatId, before = null, limit = 50)
        }
        Mockito.verifyNoInteractions(chatMessageRepository)
    }

    @Test
    fun `getLatestMessageId returns the latest id for an owned chat`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val latestMessageId = UUID.randomUUID()
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId))
            .thenReturn(ChatEntity(userId, "Trip planning"))
        Mockito.`when`(chatMessageRepository.findLatestMessageId(chatId)).thenReturn(latestMessageId)

        val result = chatService.getLatestMessageId(userId, chatId)

        assertEquals(latestMessageId, result)
    }

    @Test
    fun `getLatestMessageId enforces ownership before reading messages`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId)).thenReturn(null)

        assertFailsWith<NotFoundException> {
            chatService.getLatestMessageId(userId, chatId)
        }
        Mockito.verifyNoInteractions(chatMessageRepository)
    }

    @Test
    fun `appendUserMessage saves the user message and returns it appended to prior history`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val chat = ChatEntity(userId, "Trip planning")
        val priorMessage = ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "hello", ChatMessageStatus.COMPLETE)
        Mockito.`when`(chatRepository.findByIdAndUserId(chatId, userId)).thenReturn(chat)
        Mockito.`when`(chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chatId))
            .thenReturn(listOf(priorMessage))
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

    private fun message(chatId: UUID, content: String) =
        ChatMessageEntity(chatId, ChatMessageRole.USER, content, ChatMessageStatus.COMPLETE)
}
