package io.uliss.note_service.repository

import io.uliss.note_service.NoteIntegrationTest
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.model.projection.NotesMark
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class UserProfileNoteStoreIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var store: UserProfileNoteStore

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var profileRepository: UserProfileRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()
    private val settled = Instant.parse("2026-11-02T03:00:00Z")

    @Test
    fun `notes after the mark come in (updated_at, id) order, settled READY notes of the owner only`() {
        val sameTime = Instant.parse("2026-11-01T10:00:00Z")
        val a = note("A", sameTime)
        val b = note("B", sameTime)
        // Postgres orders uuids by unsigned bytes, as their hex strings sort
        val (first, second) = listOf(a, b).sortedBy { it.toString() }
        val later = note("Later", Instant.parse("2026-11-01T11:00:00Z"))
        note("Before mark", Instant.parse("2026-10-01T00:00:00Z"))
        note("Unsettled", settled.plusSeconds(1))
        note("Generating", sameTime, NoteStatus.GENERATING)
        note("Foreign", sameTime, owner = UUID.randomUUID())

        val notes = store.findNotesAfter(userId, NotesMark(sameTime, first), settled, limit = 10)

        assertEquals(listOf(second, later), notes.map { it.id })
        assertEquals(listOf("A", "B").first { noteId(it) == second }, notes.first().title)
    }

    @Test
    fun `users to refresh have settled READY notes after their mark, or notes and no profile yet`() {
        val noon = Instant.parse("2026-11-01T12:00:00Z")
        val newcomer = UUID.randomUUID().also { note("New", noon, owner = it) }
        val upToDate = UUID.randomUUID().also { profile(it, NotesMark(noon, note("Read", noon, owner = it))) }
        val withNewNote = UUID.randomUUID().also {
            profile(it, NotesMark(noon, note("Read", noon, owner = it)))
            note("Fresh", noon.plusSeconds(60), owner = it)
        }
        val onlyGenerating = UUID.randomUUID().also { note("Gen", noon, NoteStatus.GENERATING, owner = it) }
        val onlyUnsettled = UUID.randomUUID().also { note("Late", settled.plusSeconds(1), owner = it) }

        val users = store.findUsersToRefresh(settled).toSet()

        assertTrue(newcomer in users)
        assertTrue(withNewNote in users)
        assertFalse(upToDate in users)
        assertFalse(onlyGenerating in users)
        assertFalse(onlyUnsettled in users)
    }

    private fun profile(owner: UUID, mark: NotesMark) {
        profileRepository.saveAndFlush(UserProfileEntity(owner, "profile", mark.updatedAt, mark.noteId))
    }

    private val ids = mutableMapOf<String, UUID>()

    private fun noteId(title: String) = ids.getValue(title)

    private fun note(
        title: String,
        updatedAt: Instant,
        status: NoteStatus = NoteStatus.READY,
        owner: UUID = userId,
    ): UUID {
        val note = noteRepository.saveAndFlush(NoteEntity(owner, "$title text", title = title, status = status))
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(updatedAt), note.id)
        ids[title] = note.id
        return note.id
    }
}
