package io.uliss.note_service

import io.uliss.note_service.model.projection.ChatTurnStatus
import io.uliss.note_service.model.SummaryMode
import io.uliss.note_service.service.ChatTurnService
import io.uliss.note_service.service.facade.ChatFacade
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ChatActivityOrderIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var chatFacade: ChatFacade

    @Autowired
    lateinit var chatTurnService: ChatTurnService

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun `chats are listed by last activity, not by creation`() {
        val userId = UUID.randomUUID()
        val older = startChat(userId, "Older")
        val newer = startChat(userId, "Newer")
        setActivity(older, Instant.now().minus(Duration.ofHours(1)))
        setActivity(newer, Instant.now().minus(Duration.ofHours(2)))

        assertEquals(listOf(older, newer), chatFacade.getChats(userId).map { it.chat.id })
    }

    @Test
    fun `a new message moves the chat to the top`() {
        val userId = UUID.randomUUID()
        val target = startChat(userId, "Target")
        val other = startChat(userId, "Other")
        backdate(target, other)

        chatFacade.streamReply(userId, target, UUID.randomUUID(), "Follow-up")

        assertEquals(listOf(target, other), chatFacade.getChats(userId).map { it.chat.id })
    }

    @Test
    fun `replaying a message does not count as new activity`() {
        val userId = UUID.randomUUID()
        val chatId = startChat(userId, "Chat")
        val key = UUID.randomUUID()
        chatFacade.streamReply(userId, chatId, key, "Follow-up")
        val past = anHourAgo()
        setActivity(chatId, past)

        chatFacade.streamReply(userId, chatId, key, "Follow-up")

        assertEquals(past, activity(chatId))
    }

    @Test
    fun `renaming moves the chat to the top`() {
        val userId = UUID.randomUUID()
        val target = startChat(userId, "Target")
        val other = startChat(userId, "Other")
        backdate(target, other)

        chatFacade.renameChat(userId, target, "Renamed")

        assertEquals(listOf(target, other), chatFacade.getChats(userId).map { it.chat.id })
    }

    @Test
    fun `requesting a summary moves the chat to the top`() {
        val userId = UUID.randomUUID()
        val target = startChat(userId, "Target")
        val other = startChat(userId, "Other")
        backdate(target, other)

        chatFacade.requestSummary(userId, target, UUID.randomUUID(), SummaryMode.CREATE, null)

        assertEquals(listOf(target, other), chatFacade.getChats(userId).map { it.chat.id })
    }

    @Test
    fun `replaying a summary request does not count as new activity`() {
        val userId = UUID.randomUUID()
        val chatId = startChat(userId, "Chat")
        val key = UUID.randomUUID()
        chatFacade.requestSummary(userId, chatId, key, SummaryMode.CREATE, null)
        val past = anHourAgo()
        setActivity(chatId, past)

        chatFacade.requestSummary(userId, chatId, key, SummaryMode.CREATE, null)

        assertEquals(past, activity(chatId))
    }

    @Test
    fun `activity is newer than the backdated value after a message`() {
        val userId = UUID.randomUUID()
        val chatId = startChat(userId, "Chat")
        val past = anHourAgo()
        setActivity(chatId, past)

        chatFacade.streamReply(userId, chatId, UUID.randomUUID(), "Follow-up")

        assertTrue(activity(chatId).isAfter(past))
    }

    /** Creates a chat whose first turn is complete, so the next message can start a new turn. */
    private fun startChat(userId: UUID, content: String): UUID {
        val reply = chatFacade.streamReply(userId, null, UUID.randomUUID(), content)
        assertTrue(
            chatTurnService.finishGenerationAttempt(userId, reply.chatId, reply.turnId, 1, "Answer", ChatTurnStatus.COMPLETE)
        )
        return reply.chatId
    }

    /** Puts [target] below [other] so that only the action under test can lift it. */
    private fun backdate(target: UUID, other: UUID) {
        setActivity(target, Instant.now().minus(Duration.ofHours(2)))
        setActivity(other, Instant.now().minus(Duration.ofHours(1)))
    }

    /** Postgres keeps microseconds and rounds finer instants, which can move them into the next millisecond. */
    private fun anHourAgo(): Instant = Instant.now().minus(Duration.ofHours(1)).truncatedTo(ChronoUnit.MICROS)

    private fun setActivity(chatId: UUID, at: Instant) {
        jdbcTemplate.update("UPDATE note.chat SET updated_at = ? WHERE id = ?", Timestamp.from(at), chatId)
    }

    private fun activity(chatId: UUID): Instant =
        checkNotNull(
            jdbcTemplate.queryForObject("SELECT updated_at FROM note.chat WHERE id = ?", Timestamp::class.java, chatId)
        ).toInstant()
}
