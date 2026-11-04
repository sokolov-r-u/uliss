package io.uliss.note_service

import io.uliss.note_service.exception.PinLimitReachedException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.util.PinLimit
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import tools.jackson.databind.ObjectMapper
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.TimeUnit
import kotlin.random.Random
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ChatPinIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatService: ChatService

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var objectMapper: ObjectMapper

    private val userId = UUID.randomUUID()

    @Test
    fun `a pinned chat leaves the chat pages and comes in the pinned list`() {
        val pinned = chat("Pinned")
        val other = chat("Other")

        mockMvc.put("/note/chats/${pinned.id}/pin") { asUser() }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(pinned.id.toString()) }
            jsonPath("$.pinnedAt") { isNotEmpty() }
        }

        mockMvc.get("/note/chats") { asUser() }.andExpect {
            jsonPath("$.items.length()") { value(1) }
            jsonPath("$.items[0].id") { value(other.id.toString()) }
        }
        mockMvc.get("/note/chats/pinned") { asUser() }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(pinned.id.toString()) }
            jsonPath("$[0].noteCount") { value(0) }
        }
    }

    @Test
    fun `a pinned chat carries the count of its notes, as in the chat pages`() {
        val chat = chat("With notes")
        val note = noteRepository.save(NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), userId))

        mockMvc.put("/note/chats/${chat.id}/pin") { asUser() }.andExpect { jsonPath("$.noteCount") { value(1) } }
        mockMvc.get("/note/chats/pinned") { asUser() }.andExpect { jsonPath("$[0].noteCount") { value(1) } }
    }

    @Test
    fun `pinning a pinned chat keeps its pin time, so it keeps its place`() {
        val chat = chat("Chat")
        chatService.pinChat(userId, chat.id)
        val first = pinnedAt(chat.id)

        mockMvc.put("/note/chats/${chat.id}/pin") { asUser() }.andExpect { status { isOk() } }

        assertEquals(first, pinnedAt(chat.id))
    }

    @Test
    fun `pinning and unpinning leave the chat's activity time and version alone`() {
        val chat = chat("Chat")
        val activity = Instant.parse("2026-11-01T10:00:00Z")
        jdbcTemplate.update("UPDATE note.chat SET updated_at = ? WHERE id = ?", Timestamp.from(activity), chat.id)
        val version = version(chat.id)

        chatService.pinChat(userId, chat.id)
        chatService.unpinChat(userId, chat.id)

        assertEquals(activity, jdbcTemplate.queryForObject(
            "SELECT updated_at FROM note.chat WHERE id = ?", Timestamp::class.java, chat.id)?.toInstant())
        assertEquals(version, version(chat.id))
    }

    @Test
    fun `an unpinned chat goes back to the pages, and unpinning an unpinned chat is no error`() {
        val chat = chat("Chat")
        chatService.pinChat(userId, chat.id)

        repeat(2) {
            mockMvc.delete("/note/chats/${chat.id}/pin") { asUser() }.andExpect { status { isNoContent() } }
        }

        assertNull(pinnedAt(chat.id))
        mockMvc.get("/note/chats") { asUser() }.andExpect { jsonPath("$.items[0].id") { value(chat.id.toString()) } }
        mockMvc.get("/note/chats/pinned") { asUser() }.andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `the pinned list comes last pinned first`() {
        val chats = (1..3).map { chat("Chat $it") }
        chats.forEachIndexed { index, chat ->
            chatService.pinChat(userId, chat.id)
            setPinnedAt(chat.id, Instant.parse("2026-11-03T10:00:00Z").plusSeconds(index.toLong()))
        }

        mockMvc.get("/note/chats/pinned") { asUser() }.andExpect {
            jsonPath("$[*].id") { value(chats.reversed().map { it.id.toString() }) }
        }
    }

    @Test
    fun `a full pinned list refuses one more with 409 PIN_LIMIT_REACHED and changes nothing`() {
        repeat(PinLimit.MAX) { chatService.pinChat(userId, chat("Pinned $it").id) }
        val extra = chat("Extra")

        mockMvc.put("/note/chats/${extra.id}/pin") { asUser() }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("PIN_LIMIT_REACHED") }
        }

        assertNull(pinnedAt(extra.id))
        mockMvc.get("/note/chats/pinned") { asUser() }.andExpect { jsonPath("$.length()") { value(PinLimit.MAX) } }
    }

    @Test
    fun `a full pinned list still answers a pin of a chat already in it`() {
        val chats = (1..PinLimit.MAX).map { chat("Pinned $it") }
        chats.forEach { chatService.pinChat(userId, it.id) }

        mockMvc.put("/note/chats/${chats.first().id}/pin") { asUser() }.andExpect { status { isOk() } }
    }

    @Test
    fun `the limit is per user`() {
        val other = UUID.randomUUID()
        repeat(PinLimit.MAX) { chatService.pinChat(other, chat("Other $it", other).id) }
        val own = UUID.randomUUID()
        repeat(PinLimit.MAX) { chatService.pinChat(own, chat("Own $it", own).id) }

        assertEquals(PinLimit.MAX, chatService.getPinnedChats(own).size)
    }

    @Test
    fun `deleting a pinned chat frees its place under the limit`() {
        val chats = (1..PinLimit.MAX).map { chat("Pinned $it") }
        chats.forEach { chatService.pinChat(userId, it.id) }

        mockMvc.delete("/note/chats/${chats.first().id}") { asUser() }.andExpect { status { isNoContent() } }

        mockMvc.put("/note/chats/${chat("Next").id}/pin") { asUser() }.andExpect { status { isOk() } }
    }

    @Test
    fun `another user's chat is not found for pin and unpin, and stays unpinned`() {
        val foreign = chat("Foreign", UUID.randomUUID())

        mockMvc.put("/note/chats/${foreign.id}/pin") { asUser() }.andExpect { status { isNotFound() } }
        mockMvc.delete("/note/chats/${foreign.id}/pin") { asUser() }.andExpect { status { isNotFound() } }
        mockMvc.put("/note/chats/${UUID.randomUUID()}/pin") { asUser() }.andExpect { status { isNotFound() } }

        assertNull(pinnedAt(foreign.id))
    }

    @Test
    fun `two pins racing for the last place never make one more than the limit`() {
        repeat(PinLimit.MAX - 1) { chatService.pinChat(userId, chat("Pinned $it").id) }
        val racers = (1..2).map { chat("Racer $it") }
        val barrier = CyclicBarrier(racers.size)

        val outcomes = racers.map { racer ->
            CompletableFuture.supplyAsync {
                barrier.await(10, TimeUnit.SECONDS)
                runCatching { chatService.pinChat(userId, racer.id) }
            }
        }.map { it.get(30, TimeUnit.SECONDS) }

        assertEquals(1, outcomes.count { it.isSuccess })
        assertEquals(PinLimitReachedException::class, outcomes.single { it.isFailure }.exceptionOrNull()!!::class)
        assertEquals(PinLimit.MAX, chatService.getPinnedChats(userId).size)
    }

    @Test
    fun `the pages and the pinned list together hold every chat exactly once`() {
        // seeded subsets of pinned chats, walked page by page with a small page size
        repeat(5) { round ->
            val owner = UUID.randomUUID()
            val random = Random(round)
            val chats = (1..random.nextInt(1, 12)).map { chat("Chat $it", owner) }
            chats.shuffled(random).take(random.nextInt(0, chats.size + 1)).forEach { chatService.pinChat(owner, it.id) }

            val seen = pages(owner, pageSize = 3) + pinned(owner)

            assertEquals(chats.map { it.id }.sorted(), seen.sorted(), "round $round")
        }
    }

    private fun pages(owner: UUID, pageSize: Int): List<UUID> {
        val ids = mutableListOf<UUID>()
        var cursor: String? = null
        do {
            val query = "limit=$pageSize" + (cursor?.let { "&cursor=$it" } ?: "")
            val body = mockMvc.get("/note/chats?$query") { asUser(owner) }.andReturn().response.contentAsString
            val page = objectMapper.readTree(body)
            page["items"].forEach { ids += UUID.fromString(it["id"].asString()) }
            cursor = page["nextCursor"].takeUnless { it.isNull }?.asString()
        } while (cursor != null)
        return ids
    }

    private fun pinned(owner: UUID): List<UUID> {
        val body = mockMvc.get("/note/chats/pinned") { asUser(owner) }.andReturn().response.contentAsString
        val ids = mutableListOf<UUID>()
        objectMapper.readTree(body).forEach { ids += UUID.fromString(it["id"].asString()) }
        return ids
    }

    private fun chat(title: String, owner: UUID = userId) = chatRepository.save(ChatEntity(owner, title))

    private fun pinnedAt(id: UUID): Instant? =
        jdbcTemplate.queryForObject("SELECT pinned_at FROM note.chat WHERE id = ?", Timestamp::class.java, id)
            ?.toInstant()

    private fun setPinnedAt(id: UUID, at: Instant) {
        jdbcTemplate.update("UPDATE note.chat SET pinned_at = ? WHERE id = ?", Timestamp.from(at), id)
    }

    private fun version(id: UUID): Long? =
        jdbcTemplate.queryForObject("SELECT version FROM note.chat WHERE id = ?", Long::class.java, id)

    private fun MockHttpServletRequestDsl.asUser(owner: UUID = userId) {
        with(jwt().jwt { it.claim("userId", owner.toString()) })
    }
}
