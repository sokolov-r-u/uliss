package io.uliss.note_service

import com.jayway.jsonpath.JsonPath
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.repository.ChatRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ChatListPaginationIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun `pages walk every chat by last activity once, ties broken by id`() {
        val userId = UUID.randomUUID()
        val tie = Instant.parse("2026-11-03T10:00:00.123456Z")
        val tied = (1..4).map { chat(userId, tie) }
        val newest = chat(userId, tie.plusSeconds(60))
        val oldest = chat(userId, tie.minusSeconds(60))
        chat(UUID.randomUUID(), tie)

        val pages = walk(userId, limit = 2)

        val expected = listOf(newest) + tied.sortedByDescending { it.toString() } + listOf(oldest)
        assertEquals(listOf(2, 2, 2), pages.map { it.size })
        assertEquals(expected, pages.flatten())
    }

    @Test
    fun `a page that ends the list has no cursor`() {
        val userId = UUID.randomUUID()
        chat(userId, Instant.parse("2026-11-03T10:00:00Z"))

        val body = page(userId, "?limit=1")

        assertEquals(1, JsonPath.read<List<String>>(body, "$.items[*].id").size)
        assertNull(JsonPath.read<String?>(body, "$.nextCursor"))
    }

    /** Follows `nextCursor` until it runs out and returns the ids of every page. */
    private fun walk(userId: UUID, limit: Int): List<List<UUID>> {
        val pages = mutableListOf<List<UUID>>()
        var cursor: String? = null
        do {
            val body = page(userId, "?limit=$limit" + (cursor?.let { "&cursor=$it" } ?: ""))
            pages += JsonPath.read<List<String>>(body, "$.items[*].id").map(UUID::fromString)
            cursor = JsonPath.read<String?>(body, "$.nextCursor")
        } while (cursor != null)
        return pages
    }

    private fun page(userId: UUID, query: String): String =
        mockMvc.get("/note/chats$query") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString

    private fun chat(userId: UUID, activity: Instant): UUID {
        val id = chatRepository.save(ChatEntity(userId, "Chat")).id
        jdbcTemplate.update("UPDATE note.chat SET updated_at = ? WHERE id = ?", Timestamp.from(activity), id)
        return id
    }
}
