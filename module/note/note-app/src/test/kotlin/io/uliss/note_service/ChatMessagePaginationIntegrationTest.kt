package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.service.ChatService
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class ChatMessagePaginationIntegrationTest {

    @Autowired
    lateinit var chatService: ChatService

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun `uuid v7 cursor pages have no overlaps or gaps when a new tail message arrives`() {
        val userId = UUID.randomUUID()
        val chatId = chatRepository.save(ChatEntity(userId, "Pagination")).id
        val initialMessages = (0..4).map { index -> message(chatId, "message-$index") }
        assertTrue(initialMessages.all { it.id.version() == 7 })
        chatMessageRepository.saveAll(initialMessages)

        val latestPage = chatService.getMessages(userId, chatId, before = null, limit = 2)

        assertEquals(initialMessages.takeLast(2).map { it.id }, latestPage.messages.map { it.id })
        assertEquals(initialMessages[3].id, latestPage.nextCursor)
        assertTrue(latestPage.hasMore)

        val appendedMessage = chatMessageRepository.save(message(chatId, "new-tail"))
        val middlePage = chatService.getMessages(userId, chatId, latestPage.nextCursor, limit = 2)
        val oldestPage = chatService.getMessages(userId, chatId, middlePage.nextCursor, limit = 2)

        assertEquals(initialMessages.slice(1..2).map { it.id }, middlePage.messages.map { it.id })
        assertEquals(initialMessages[1].id, middlePage.nextCursor)
        assertTrue(middlePage.hasMore)
        assertEquals(listOf(initialMessages[0].id), oldestPage.messages.map { it.id })
        assertEquals(null, oldestPage.nextCursor)
        assertEquals(false, oldestPage.hasMore)

        val loadedInitialIds = oldestPage.messages + middlePage.messages + latestPage.messages
        assertEquals(initialMessages.map { it.id }, loadedInitialIds.map { it.id })
        assertEquals(initialMessages.size, loadedInitialIds.map { it.id }.toSet().size)

        val refreshedLatestPage = chatService.getMessages(userId, chatId, before = null, limit = 2)
        assertEquals(
            listOf(initialMessages.last().id, appendedMessage.id),
            refreshedLatestPage.messages.map { it.id },
        )
    }

    private fun message(chatId: UUID, content: String) =
        ChatMessageEntity(chatId, ChatMessageRole.USER, content, ChatMessageStatus.COMPLETE)
}
