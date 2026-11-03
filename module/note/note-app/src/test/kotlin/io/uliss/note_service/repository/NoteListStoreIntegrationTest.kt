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

    @Test
    fun `a constellation filter keeps the notes of the constellation and of its whole subtree`() {
        val at = Instant.parse("2026-11-03T10:00:00Z")
        val music = constellation(userId, null)
        val rock = constellation(userId, music)
        val glam = constellation(userId, rock)
        val films = constellation(userId, null)
        val inMusic = placed(note(userId, at), music)
        val inGlam = placed(note(userId, at.minusSeconds(1)), glam)
        placed(note(userId, at.minusSeconds(2)), films)
        note(userId, at.minusSeconds(3))

        val page = store.findPage(userId, null, 10, setOf(music))

        assertEquals(listOf(inMusic, inGlam), page.map { it.id })
    }

    @Test
    fun `a constellation filter keeps every sub-note of the notes placed there, at any depth`() {
        val at = Instant.parse("2026-11-03T10:00:00Z")
        val music = constellation(userId, null)
        val bowie = placed(note(userId, at), music)
        val album = subNote(note(userId, at.minusSeconds(1)), bowie)
        val song = subNote(note(userId, at.minusSeconds(2)), album)
        subNote(note(userId, at.minusSeconds(3)), note(userId, at.minusSeconds(4)))

        val page = store.findPage(userId, null, 10, setOf(music))

        assertEquals(listOf(bowie, album, song), page.map { it.id })
    }

    @Test
    fun `several constellations are a union with each note once, unknown and foreign ones add nothing`() {
        val at = Instant.parse("2026-11-03T10:00:00Z")
        val music = constellation(userId, null)
        val rock = constellation(userId, music)
        val films = constellation(userId, null)
        val stranger = UUID.randomUUID()
        val foreign = constellation(stranger, null)
        val inBoth = placed(placed(note(userId, at), films), rock, main = false)
        val inMusic = placed(note(userId, at.minusSeconds(1)), music)
        val inFilms = placed(note(userId, at.minusSeconds(2)), films)
        placed(note(stranger, at), foreign)

        val page = store.findPage(userId, null, 10, setOf(music, rock, films, foreign, UUID.randomUUID(), music))

        assertEquals(listOf(inBoth, inMusic, inFilms), page.map { it.id })
        assertEquals(emptyList(), store.findPage(userId, null, 10, setOf(foreign)))
    }

    @Test
    fun `a filtered list pages by keyset without repeats or gaps`() {
        val tie = Instant.parse("2026-11-03T10:00:00Z")
        val music = constellation(userId, null)
        val all = (1..5).map { placed(note(userId, tie), music) } + note(userId, tie)

        val first = store.findPage(userId, null, 2, setOf(music))
        val second = store.findPage(userId, first.last(), 2, setOf(music))
        val third = store.findPage(userId, second.last(), 2, setOf(music))

        val ids = (first + second + third).map { it.id }
        assertEquals(all.take(5).sortedByDescending { it.toString() }, ids)
    }

    @Test
    fun `count with a filter counts the filtered list, each note once`() {
        val at = Instant.parse("2026-11-03T10:00:00Z")
        val music = constellation(userId, null)
        val rock = constellation(userId, music)
        val placedTwice = placed(placed(note(userId, at), music), rock, main = false)
        subNote(note(userId, at), placedTwice)
        placed(note(userId, at), rock)
        note(userId, at)

        assertEquals(3, store.count(userId, setOf(music, rock)))
        assertEquals(4, store.count(userId))
    }

    private fun subNote(noteId: UUID, parentNoteId: UUID): UUID {
        jdbcTemplate.update("UPDATE note.notes SET parent_note_id = ? WHERE id = ?", parentNoteId, noteId)
        return noteId
    }

    private fun constellation(owner: UUID, parent: UUID?): UUID {
        val id = UUID.randomUUID()
        jdbcTemplate.update(
            """
                INSERT INTO note.constellations
                    (id, user_id, parent_id, name, hue, lightness, created_at, updated_at, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, now(), now(), 'test', 'test')
            """,
            id,
            owner,
            parent,
            id.toString().take(8),
            if (parent == null) 10 else null,
            if (parent == null) null else "BASE",
        )
        return id
    }

    private fun placed(noteId: UUID, constellationId: UUID, main: Boolean = true): UUID {
        jdbcTemplate.update(
            """
                INSERT INTO note.note_constellation (note_id, constellation_id, user_id, is_main, added_at)
                SELECT id, ?, user_id, ?, now() FROM note.notes WHERE id = ?
            """,
            constellationId, main, noteId,
        )
        return noteId
    }

    private fun note(owner: UUID, updatedAt: Instant): UUID {
        val id = noteRepository.save(NoteEntity(owner, "body")).id
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(updatedAt), id)
        return id
    }
}
