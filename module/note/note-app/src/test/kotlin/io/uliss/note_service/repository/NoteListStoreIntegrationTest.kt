package io.uliss.note_service.repository

import io.uliss.note_service.NoteIntegrationTest
import io.uliss.note_service.dto.internal.ListCursor
import io.uliss.note_service.model.NoteEntity
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals

class NoteListStoreIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var store: NoteListStore

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()

    @Test
    fun `positions come by last change, newest first, ties by id, the owner's notes only`() {
        val tie = Instant.parse("2026-11-03T10:00:00.123456Z")
        val tied = (1..3).map { note(userId, tie) }
        val newest = note(userId, tie.plusSeconds(1))
        val oldest = note(userId, tie.minusSeconds(1))
        note(UUID.randomUUID(), tie)

        val positions = store.findPage(userId, null, 10)

        // Postgres orders uuids by unsigned bytes, as their hex strings sort
        val expected = listOf(newest) + tied.sortedByDescending { it.toString() } + listOf(oldest)
        assertEquals(expected, positions.map { it.id })
        assertEquals(listOf(tie.plusSeconds(1)) + List(3) { tie } + tie.minusSeconds(1), positions.map { it.updatedAt })
    }

    @Test
    fun `a page after a position continues strictly after it, also inside a tie`() {
        val tie = Instant.parse("2026-11-03T10:00:00Z")
        val all = (1..4).map { note(userId, tie) } + note(userId, tie.minusSeconds(1))
        val ordered = store.findPage(userId, null, 10)

        val rest = store.findPage(userId, ordered[1], 10)

        assertEquals(ordered.drop(2), rest)
        assertEquals(all.toSet(), ordered.map { it.id }.toSet())
        assertEquals(2, store.findPage(userId, ordered[1], 2).size)
    }

    @Test
    fun `a cursor carrying another user's position reveals nothing of theirs`() {
        val foreign = note(UUID.randomUUID(), Instant.parse("2026-11-03T09:00:00Z"))
        val own = note(userId, Instant.parse("2026-11-03T08:00:00Z"))

        val page = store.findPage(userId, ListCursor(Instant.parse("2026-11-03T10:00:00Z"), foreign), 10)

        assertEquals(listOf(own), page.map { it.id })
    }

    @Test
    fun `count counts the owner's notes only`() {
        repeat(3) { note(userId, Instant.parse("2026-11-03T10:00:00Z")) }
        note(UUID.randomUUID(), Instant.parse("2026-11-03T10:00:00Z"))

        assertEquals(3, store.count(userId))
    }

    private fun note(owner: UUID, updatedAt: Instant): UUID {
        val id = noteRepository.save(NoteEntity(owner, "body")).id
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(updatedAt), id)
        return id
    }
}
