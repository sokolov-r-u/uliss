package io.uliss.note_service.service

import io.uliss.note_service.NoteIntegrationTest
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.model.projection.NotesMark
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.UserProfileRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

class UserProfileServiceIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var service: UserProfileService

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var profileRepository: UserProfileRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()
    private val hourAgo = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS)

    @Test
    fun `without a profile the batch holds the settled notes and moves the mark to the last one`() {
        val first = note("First", hourAgo)
        val second = note("Second", hourAgo.plusSeconds(1))
        note("Just written", Instant.now())

        val batch = service.findBatch(userId)!!

        assertNull(batch.profile)
        assertEquals(listOf(first, second), batch.notes.map { it.id })
        assertEquals(NotesMark(hourAgo.plusSeconds(1), second), batch.through)
        assertFalse(batch.remain)
    }

    @Test
    fun `saving the first batch creates the profile at its mark and queues the next batch while notes remain`() {
        val first = note("First", hourAgo)
        val batch = service.findBatch(userId)!!.copy(remain = true)

        service.save(userId, batch, "## Interests\nFirst.")

        val profile = profileRepository.findByUserId(userId)!!
        assertEquals("## Interests\nFirst.", profile.content)
        assertEquals(NotesMark(hourAgo, first), profile.notesThrough)
        assertEquals(1, pendingRefreshEvents())
    }

    @Test
    fun `saving the next batch rewrites the same profile, moves its mark, and queues nothing when no notes remain`() {
        note("First", hourAgo)
        service.save(userId, service.findBatch(userId)!!, "first profile")
        val second = note("Second", hourAgo.plusSeconds(1))
        val batch = service.findBatch(userId)!!
        assertEquals("first profile", batch.profile)
        assertEquals(listOf(second), batch.notes.map { it.id })

        service.save(userId, batch, "second profile")

        val profile = profileRepository.findByUserId(userId)!!
        assertEquals("second profile", profile.content)
        assertEquals(NotesMark(hourAgo.plusSeconds(1), second), profile.notesThrough)
        assertNull(service.findBatch(userId))
        assertEquals(0, pendingRefreshEvents())
    }

    @Test
    fun `a batch read before another run saved the profile is dropped, so two runs never mix their notes`() {
        note("First", hourAgo)
        val staleCreate = service.findBatch(userId)!!
        service.save(userId, staleCreate, "winner")
        note("Second", hourAgo.plusSeconds(1))
        val staleUpdate = service.findBatch(userId)!!
        service.save(userId, service.findBatch(userId)!!, "second winner")

        service.save(userId, staleCreate, "late create")
        service.save(userId, staleUpdate, "late update")

        assertEquals("second winner", profileRepository.findByUserId(userId)!!.content)
    }

    @Test
    fun `the nightly request queues one refresh per user with unread notes, and running it again adds none`() {
        note("First", hourAgo)
        val upToDate = UUID.randomUUID()
        profileRepository.saveAndFlush(
            UserProfileEntity(upToDate, "read", hourAgo, note("Read", hourAgo, owner = upToDate))
        )

        service.requestRefreshes()
        service.requestRefreshes()

        assertEquals(1, pendingRefreshEvents())
        assertEquals(0, pendingRefreshEvents(upToDate))
    }

    private fun pendingRefreshEvents(owner: UUID = userId): Int = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM note.outbox_event WHERE status = 'PENDING' AND dedup_key = ?",
        Int::class.java,
        "USER_PROFILE_REFRESH_REQUESTED:$owner",
    )!!

    private fun note(title: String, updatedAt: Instant, owner: UUID = userId): UUID {
        val note = noteRepository.saveAndFlush(NoteEntity(owner, "$title text", title = title))
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(updatedAt), note.id)
        return note.id
    }
}
