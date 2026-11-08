package io.uliss.note_service

import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.service.ChatService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ChatTitleSourceIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatService: ChatService

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()

    @Test
    fun `a generated title replaces the first-message title without lifting the chat or bumping its version`() {
        val chat = chatRepository.save(ChatEntity(userId, "How do I tune a guitar to drop D and keep it..."))
        val before = row(chat.id)

        assertTrue(chatService.applyGeneratedTitle(userId, chat.id, "Drop D tuning"))

        val after = row(chat.id)
        assertEquals("Drop D tuning", after["title"])
        assertEquals("GENERATED", after["title_source"])
        assertEquals(before["updated_at"], after["updated_at"])
        assertEquals(before["version"], after["version"])
    }

    @Test
    fun `a new chat starts with a first-message title`() {
        val chat = chatRepository.save(ChatEntity(userId, "Hello"))

        assertEquals("FIRST_MESSAGE", row(chat.id)["title_source"])
    }

    @Test
    fun `a title the user gave wins over a generated one`() {
        val chat = chatRepository.save(ChatEntity(userId, "Hello"))
        chatService.renameChat(userId, chat.id, "Mine")

        assertFalse(chatService.applyGeneratedTitle(userId, chat.id, "Generated"))

        val after = row(chat.id)
        assertEquals("Mine", after["title"])
        assertEquals("USER", after["title_source"])
    }

    @Test
    fun `a generated title never lands on another user's chat`() {
        val chat = chatRepository.save(ChatEntity(userId, "Hello"))

        assertFalse(chatService.applyGeneratedTitle(UUID.randomUUID(), chat.id, "Generated"))
        assertEquals("Hello", row(chat.id)["title"])
    }

    @Test
    fun `a second generated title does not replace the first`() {
        val chat = chatRepository.save(ChatEntity(userId, "Hello"))
        chatService.applyGeneratedTitle(userId, chat.id, "First")

        assertFalse(chatService.applyGeneratedTitle(userId, chat.id, "Second"))
        assertEquals("First", row(chat.id)["title"])
    }

    private fun row(id: UUID): Map<String, Any?> =
        jdbcTemplate.queryForMap("SELECT title, title_source, updated_at, version FROM note.chat WHERE id = ?", id)
}
