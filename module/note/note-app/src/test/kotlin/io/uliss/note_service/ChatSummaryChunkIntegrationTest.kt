package io.uliss.note_service

import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.service.ChatService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ChatSummaryChunkIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var chatService: ChatService

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Test
    fun `the next chunk starts after the boundary and ends within the limit before the target`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Chunks"))
        val boundary = message(chat)
        val after = (1..6).map { message(chat) }
        val target = after[4]

        assertEquals(after[2].id, chatService.findSummaryChunkEnd(userId, chat.id, boundary.id, target.id, 60))
        assertEquals(target.id, chatService.findSummaryChunkEnd(userId, chat.id, boundary.id, target.id, 1000))
        assertEquals(after[1].id, chatService.findSummaryChunkEnd(userId, chat.id, null, target.id, 60))
    }

    @Test
    fun `a target removed by a retry still bounds the chunk, which ends before it`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Retried"))
        val boundary = message(chat)
        val before = message(chat)
        val target = message(chat)
        chatMessageRepository.delete(target)
        message(chat)

        assertEquals(before.id, chatService.findSummaryChunkEnd(userId, chat.id, boundary.id, target.id, 1000))
        assertNull(chatService.findSummaryChunkEnd(userId, chat.id, before.id, target.id, 1000))
    }

    // messages without a turn: the turn grouping is covered by ChatSummaryChunksTest
    private fun message(chat: ChatEntity): ChatMessageEntity =
        chatMessageRepository.save(ChatMessageEntity(chat.id, ChatMessageRole.USER, "m".repeat(20), ChatMessageStatus.COMPLETE))
}
