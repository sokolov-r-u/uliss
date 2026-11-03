package io.uliss.note_service.service

import io.uliss.note_service.NoteIntegrationTest
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.ProfileRebuildTrigger
import io.uliss.note_service.model.SubNoteFate
import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.model.UserProfileRebuildEntity
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.UserProfileRebuildRepository
import io.uliss.note_service.repository.UserProfileRepository
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class UserProfileDeletionIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var hierarchyService: NoteHierarchyService

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var profileRepository: UserProfileRepository

    @Autowired
    lateinit var rebuildRepository: UserProfileRebuildRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var transactionTemplate: TransactionTemplate

    private val userId = UUID.randomUUID()
    private val dayAgo = Instant.now().minus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS)
    private val hourAgo = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS)

    @Test
    fun `deleting a note created before the profile mark flags the profile, even when edited after the mark`() {
        val read = note("Read", createdAt = dayAgo)
        profile(markAt = hourAgo.minusSeconds(60))
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(hourAgo), read)

        hierarchyService.delete(userId, read, null)

        assertNotNull(lastDeletionAt())
    }

    @Test
    fun `deleting a note created after the profile mark leaves the profile unflagged`() {
        profile(markAt = dayAgo)
        val unread = note("Unread", createdAt = hourAgo)

        hierarchyService.delete(userId, unread, null)

        assertNull(lastDeletionAt())
    }

    @Test
    fun `deleting a note a running rebuild has read flags the profile even past the profile mark`() {
        profile(markAt = dayAgo)
        val inDraft = note("In draft", createdAt = hourAgo)
        rebuildRepository.saveAndFlush(
            UserProfileRebuildEntity(userId, ProfileRebuildTrigger.USER).apply {
                throughAt = hourAgo.plusSeconds(1)
                throughId = inDraft
            }
        )

        hierarchyService.delete(userId, inDraft, null)

        assertNotNull(lastDeletionAt())
    }

    @Test
    fun `deleting a subtree flags the profile when any of its notes was read`() {
        val parent = note("Parent", createdAt = hourAgo)
        note("Child", createdAt = dayAgo, parent = parent)
        profile(markAt = dayAgo.plusSeconds(1))

        hierarchyService.delete(userId, parent, SubNoteFate.DELETE)

        assertNotNull(lastDeletionAt())
    }

    @Test
    fun `a later deletion moves the flag to its own time`() {
        val read = note("Read", createdAt = dayAgo)
        profile(markAt = hourAgo)
        jdbcTemplate.update(
            "UPDATE note.user_profile SET last_deletion_at = ? WHERE user_id = ?", Timestamp.from(dayAgo), userId,
        )

        hierarchyService.delete(userId, read, null)

        assertTrue(lastDeletionAt()!!.isAfter(hourAgo))
    }

    @Test
    fun `a rolled back deletion leaves no flag`() {
        val read = note("Read", createdAt = dayAgo)
        profile(markAt = hourAgo)

        assertThrows<IllegalStateException> {
            transactionTemplate.executeWithoutResult {
                hierarchyService.delete(userId, read, null)
                error("roll back")
            }
        }

        assertNull(lastDeletionAt())
    }

    @Test
    fun `deleting a note flags only its owner's profile`() {
        val other = UUID.randomUUID()
        profileRepository.saveAndFlush(UserProfileEntity(other, "other", hourAgo, UUID.randomUUID()))
        val read = note("Read", createdAt = dayAgo)
        profile(markAt = hourAgo)

        hierarchyService.delete(userId, read, null)

        assertNull(profileRepository.findByUserId(other)!!.lastDeletionAt)
    }

    @Test
    fun `deleting a note of a user without a profile row creates no profile`() {
        val note = note("Read", createdAt = dayAgo)

        hierarchyService.delete(userId, note, null)

        assertNull(profileRepository.findByUserId(userId))
    }

    private fun lastDeletionAt(): Instant? = profileRepository.findByUserId(userId)!!.lastDeletionAt

    private fun profile(markAt: Instant) {
        profileRepository.saveAndFlush(UserProfileEntity(userId, "profile", markAt, UUID.randomUUID()))
    }

    private fun note(title: String, createdAt: Instant, parent: UUID? = null): UUID {
        val note = noteRepository.saveAndFlush(NoteEntity(userId, "$title text", title = title, parentNoteId = parent))
        jdbcTemplate.update(
            "UPDATE note.notes SET created_at = ?, updated_at = ? WHERE id = ?",
            Timestamp.from(createdAt), Timestamp.from(createdAt), note.id,
        )
        return note.id
    }
}
