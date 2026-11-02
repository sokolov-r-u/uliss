package io.uliss.note_service

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.ProfileRebuildTrigger
import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.model.UserProfileRebuildEntity
import io.uliss.note_service.model.payload.UserProfileRefreshRequestedPayload
import io.uliss.note_service.model.projection.NotesMark
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.UserProfileRebuildRepository
import io.uliss.note_service.repository.UserProfileRepository
import io.uliss.note_service.service.UserProfileService
import io.uliss.note_service.service.handler.UserProfileRefreshRequestedHandler
import io.uliss.note_service.service.handler.UserProfileRefreshTerminalFailureHandler
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestPropertySource
import tools.jackson.databind.ObjectMapper
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Four notes per batch at most: one halving takes two, the next takes one. */
@TestPropertySource(properties = ["note.profile.batch-max-notes=4"])
class UserProfileFailingBatchIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var handler: UserProfileRefreshRequestedHandler

    @Autowired
    lateinit var terminalFailureHandler: UserProfileRefreshTerminalFailureHandler

    @Autowired
    lateinit var service: UserProfileService

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var profileRepository: UserProfileRepository

    @Autowired
    lateinit var rebuildRepository: UserProfileRebuildRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var objectMapper: ObjectMapper

    private val userId = UUID.randomUUID()
    private val request = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
    private val response = Mockito.mock(ChatClient.CallResponseSpec::class.java)
    private val base = Instant.now().minus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS)
    private val readPrompts = mutableListOf<String>()

    @Test
    fun `a batch that always fails is halved an hour later, and only the note it fails on is skipped`() {
        val notes = listOf("Alpha", "Beta", "POISON", "Delta").mapIndexed { i, t -> note(t, base.plusSeconds(i.toLong())) }
        profileRepository.saveAndFlush(UserProfileEntity(userId, "old", base.minusSeconds(60), UUID.randomUUID()))
        stubModel()

        failForGood()
        assertEquals(1, profile().batchShrink)
        assertTrue(nextAttemptAt().isAfter(Instant.now().plus(Duration.ofMinutes(50))), "the halved batch waits")
        runUntilRead()

        val profile = profile()
        assertEquals(NotesMark(base.plusSeconds(3), notes[3]), profile.notesThrough)
        assertEquals(0, profile.batchShrink)
        assertTrue(readPrompts.none { "POISON" in it })
        assertTrue(listOf("Alpha", "Beta", "Delta").all { title -> readPrompts.any { title in it } })
    }

    @Test
    fun `a first note that always fails is skipped into a profile row without text`() {
        val poison = note("POISON", base)
        stubModel()

        runUntilRead()

        val profile = profile()
        assertNull(profile.content)
        assertEquals(NotesMark(base, poison), profile.notesThrough)
    }

    @Test
    fun `a rebuild skips the note it fails on in its draft and leaves the live profile alone`() {
        note("Alpha", base)
        val poison = note("POISON", base.plusSeconds(1))
        profileRepository.saveAndFlush(UserProfileEntity(userId, "old", base.plusSeconds(1), poison))
        rebuildRepository.saveAndFlush(UserProfileRebuildEntity(userId, ProfileRebuildTrigger.USER))
        stubModel()

        failForGood()
        assertEquals(1, draft().batchShrink)
        assertEquals(0, profile().batchShrink, "the live profile's batches are not the ones failing")
        runUntilRead()

        val draft = draft()
        assertEquals(NotesMark(base.plusSeconds(1), poison), draft.through)
        assertEquals(0, draft.batchShrink)
        assertEquals("old", profile().content)
        assertEquals(1, readPrompts.size)
        assertTrue("Alpha" in readPrompts.single())
    }

    private fun draft(): UserProfileRebuildEntity = rebuildRepository.findAll().single { it.userId == userId }

    /** One event that fails every attempt: the outbox then hands it to the terminal failure handler. */
    private fun failForGood() {
        val event = event()
        runCatching { handler.handle(event) }.onSuccess { error("the batch did not fail") }
        terminalFailureHandler.handleTerminalFailure(event)
    }

    /** Events until the profile has read every note; a failing one ends as the outbox would end it. */
    private fun runUntilRead() {
        repeat(20) {
            if (service.findBatch(userId) == null) return
            val event = event()
            runCatching { handler.handle(event) }.onFailure { terminalFailureHandler.handleTerminalFailure(event) }
        }
        error("the profile never read all notes")
    }

    private fun profile(): UserProfileEntity = profileRepository.findByUserId(userId)!!

    private fun nextAttemptAt(): Instant = jdbcTemplate.queryForObject(
        "SELECT next_attempt_at FROM note.outbox_event WHERE status = 'PENDING' AND dedup_key = ?",
        Timestamp::class.java,
        "USER_PROFILE_REFRESH_REQUESTED:$userId",
    )!!.toInstant()

    /** The model fails every call that reads the poison note and answers the rest. */
    private fun stubModel() {
        var lastUser = ""
        Mockito.`when`(chatClient.prompt()).thenReturn(request)
        Mockito.`when`(request.system(anyValue<String>())).thenReturn(request)
        Mockito.`when`(request.user(anyValue<String>())).thenAnswer {
            lastUser = it.getArgument(0)
            request
        }
        Mockito.`when`(request.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(request)
        Mockito.`when`(request.call()).thenReturn(response)
        Mockito.`when`(response.content()).thenAnswer {
            if ("POISON" in lastUser) error("the provider refused the batch")
            readPrompts += lastUser
            "profile after ${readPrompts.size} batches"
        }
    }

    private fun note(title: String, updatedAt: Instant): UUID {
        val note = noteRepository.saveAndFlush(NoteEntity(userId, "$title text", title = title))
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(updatedAt), note.id)
        return note.id
    }

    private fun event() = OutboxEventEntity(
        type = OutboxEventType.USER_PROFILE_REFRESH_REQUESTED,
        payload = objectMapper.writeValueAsString(UserProfileRefreshRequestedPayload(userId)),
        status = OutboxEventStatus.PROCESSING,
        attempts = 3,
        nextAttemptAt = Instant.now(),
        lastError = "the provider refused the batch",
    )
}
