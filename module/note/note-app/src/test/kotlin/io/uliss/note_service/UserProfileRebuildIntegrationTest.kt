package io.uliss.note_service

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.ProfileRebuildStatus
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
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** One note per batch, so a rebuild of two notes takes three events: two batches and the one that finds no more. */
@TestPropertySource(properties = ["note.profile.batch-max-notes=1"])
class UserProfileRebuildIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var handler: UserProfileRefreshRequestedHandler

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
    private val twoHoursAgo = Instant.now().minus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS)
    private val hourAgo = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS)

    @Test
    fun `a rebuild reads every note into a draft and replaces the live profile only after the last batch`() {
        note("Jazz", "Coltrane is my favorite.", twoHoursAgo)
        val opera = note("Opera", "Tosca moved me.", hourAgo)
        liveProfile("old profile", NotesMark(hourAgo, opera))
        val rebuild = startRebuild()
        stubModel("draft one", "draft two")

        handler.handle(event())
        assertEquals("old profile", profile().content)
        assertEquals("draft one", rebuildRepository.findById(rebuild).get().content)
        handler.handle(event())
        assertEquals("old profile", profile().content)
        handler.handle(event())

        assertEquals("draft two", profile().content)
        assertEquals(NotesMark(hourAgo, opera), profile().notesThrough)
        val done = rebuildRepository.findById(rebuild).get()
        assertEquals(ProfileRebuildStatus.DONE, done.status)
        assertNotNull(done.finishedAt)
        val users = userPrompts()
        assertTrue("CURRENT PROFILE" !in users[0] && "Coltrane" in users[0], "the draft starts from the first note")
        assertTrue("draft one" in users[1] && "Tosca" in users[1], "the next batch updates the draft")
    }

    @Test
    fun `a finished rebuild clears a deletion made before it started and keeps one made while it ran`() {
        val opera = note("Opera", "Tosca moved me.", hourAgo)
        liveProfile("old profile", NotesMark(hourAgo, opera))
        val before = startRebuild()
        stampDeletion(createdAt(before).minusSeconds(60))
        stubModel("rebuilt")
        repeat(2) { handler.handle(event()) }
        assertNull(profile().lastDeletionAt)

        val during = startRebuild()
        stampDeletion(createdAt(during).plusSeconds(60))
        stubModel("rebuilt again")
        repeat(2) { handler.handle(event()) }

        assertNotNull(profile().lastDeletionAt)
    }

    @Test
    fun `a rebuild that finds no settled notes leaves the profile without text`() {
        liveProfile("old profile", NotesMark(hourAgo, UUID.randomUUID()))
        note("Just written", "Fresh.", Instant.now())
        val rebuild = startRebuild()

        handler.handle(event())

        assertNull(profile().content)
        assertEquals(ProfileRebuildStatus.DONE, rebuildRepository.findById(rebuild).get().status)
        assertTrue(userPrompts().isEmpty())
    }

    @Test
    fun `a draft batch read before another run saved the draft is dropped`() {
        note("Jazz", "Coltrane.", twoHoursAgo)
        val rebuild = startRebuild()
        val stale = service.findBatch(userId)!!
        service.save(userId, service.findBatch(userId)!!, "winner")

        service.save(userId, stale, "late")

        assertEquals("winner", rebuildRepository.findById(rebuild).get().content)
    }

    @Test
    fun `the nightly request starts a rebuild for a flagged profile that never had one`() {
        liveProfile("old profile", NotesMark(hourAgo, UUID.randomUUID()))
        stampDeletion(hourAgo)

        service.requestRefreshes()
        service.requestRefreshes()

        val rebuilds = rebuilds()
        assertEquals(1, rebuilds.size)
        assertEquals(ProfileRebuildTrigger.DELETIONS, rebuilds.single().trigger)
        assertEquals(ProfileRebuildStatus.RUNNING, rebuilds.single().status)
        assertEquals(1, pendingRefreshEvents())
    }

    @Test
    fun `the nightly request waits for the interval since the last finished rebuild of any trigger`() {
        liveProfile("old profile", NotesMark(hourAgo, UUID.randomUUID()))
        stampDeletion(hourAgo)
        val recent = finishedRebuild(ProfileRebuildTrigger.USER, Instant.now().minus(10, ChronoUnit.DAYS))

        service.requestRefreshes()
        assertEquals(listOf(recent), rebuilds().map { it.id })

        jdbcTemplate.update(
            "UPDATE note.user_profile_rebuild SET finished_at = ? WHERE id = ?",
            Timestamp.from(Instant.now().minus(31, ChronoUnit.DAYS)), recent,
        )
        service.requestRefreshes()
        assertEquals(1, rebuilds().count { it.status == ProfileRebuildStatus.RUNNING })
    }

    @Test
    fun `the nightly request queues a running rebuild again instead of starting another`() {
        liveProfile("old profile", NotesMark(hourAgo, UUID.randomUUID()))
        stampDeletion(hourAgo)
        val running = startRebuild()

        service.requestRefreshes()

        assertEquals(listOf(running), rebuilds().map { it.id })
        assertEquals(1, pendingRefreshEvents())
    }

    @Test
    fun `the nightly request leaves a refresh that already waits or runs alone, so a halved batch keeps its delay`() {
        note("Opera", "Tosca moved me.", hourAgo)
        liveProfile("old profile", NotesMark(twoHoursAgo, UUID.randomUUID()))
        startRebuild()
        service.requestRefresh(userId, Duration.ofHours(1))
        val due = nextAttemptAt()

        service.requestRefreshes()

        assertEquals(due, nextAttemptAt())
        jdbcTemplate.update(
            "UPDATE note.outbox_event SET status = 'PROCESSING' WHERE dedup_key = ?",
            "USER_PROFILE_REFRESH_REQUESTED:$userId",
        )
        service.requestRefreshes()
        assertEquals(0, pendingRefreshEvents(), "a second event would read the same batch in parallel")
    }

    @Test
    fun `the nightly request starts no rebuild for a profile without deletions`() {
        liveProfile("old profile", NotesMark(hourAgo, UUID.randomUUID()))

        service.requestRefreshes()

        assertTrue(rebuilds().isEmpty())
        assertFalse(pendingRefreshEvents() > 0)
    }

    private fun profile(): UserProfileEntity = profileRepository.findByUserId(userId)!!

    private fun rebuilds(): List<UserProfileRebuildEntity> = rebuildRepository.findAll().filter { it.userId == userId }

    private fun liveProfile(content: String, mark: NotesMark) {
        profileRepository.saveAndFlush(UserProfileEntity(userId, content, mark.updatedAt, mark.noteId))
    }

    private fun startRebuild(): UUID =
        rebuildRepository.saveAndFlush(UserProfileRebuildEntity(userId, ProfileRebuildTrigger.USER)).id

    private fun finishedRebuild(trigger: ProfileRebuildTrigger, finishedAt: Instant): UUID =
        rebuildRepository.saveAndFlush(
            UserProfileRebuildEntity(userId, trigger, ProfileRebuildStatus.DONE, finishedAt = finishedAt)
        ).id

    private fun createdAt(rebuild: UUID): Instant = checkNotNull(rebuildRepository.findById(rebuild).get().createdAt)

    private fun stampDeletion(at: Instant) {
        jdbcTemplate.update(
            "UPDATE note.user_profile SET last_deletion_at = ? WHERE user_id = ?", Timestamp.from(at), userId,
        )
    }

    private fun pendingRefreshEvents(): Int = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM note.outbox_event WHERE status = 'PENDING' AND dedup_key = ?",
        Int::class.java,
        "USER_PROFILE_REFRESH_REQUESTED:$userId",
    )!!

    private fun nextAttemptAt(): Instant = jdbcTemplate.queryForObject(
        "SELECT next_attempt_at FROM note.outbox_event WHERE status = 'PENDING' AND dedup_key = ?",
        Timestamp::class.java,
        "USER_PROFILE_REFRESH_REQUESTED:$userId",
    )!!.toInstant()

    private fun userPrompts(): List<String> = Mockito.mockingDetails(request).invocations
        .filter { it.method.name == "user" }
        .map { it.arguments[0] as String }

    private fun stubModel(vararg answers: String) {
        Mockito.`when`(chatClient.prompt()).thenReturn(request)
        Mockito.`when`(request.system(anyValue<String>())).thenReturn(request)
        Mockito.`when`(request.user(anyValue<String>())).thenReturn(request)
        Mockito.`when`(request.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(request)
        Mockito.`when`(request.call()).thenReturn(response)
        Mockito.`when`(response.content()).thenReturn(answers.first(), *answers.drop(1).toTypedArray())
    }

    private fun note(title: String, content: String, updatedAt: Instant): UUID {
        val note = noteRepository.saveAndFlush(NoteEntity(userId, content, title = title))
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(updatedAt), note.id)
        return note.id
    }

    private fun event() = OutboxEventEntity(
        type = OutboxEventType.USER_PROFILE_REFRESH_REQUESTED,
        payload = objectMapper.writeValueAsString(UserProfileRefreshRequestedPayload(userId)),
        status = OutboxEventStatus.PROCESSING,
        attempts = 0,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )
}
