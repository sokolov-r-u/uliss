package io.uliss.note_service.repository

import io.uliss.note_service.NoteIntegrationTest
import io.uliss.note_service.model.ConstellationEntity
import io.uliss.note_service.model.ConstellationLightness
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.projection.ConstellationNoteCount
import io.uliss.note_service.model.projection.NoteMembership
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.IllegalTransactionStateException
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class NoteConstellationStoreIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var store: NoteConstellationStore

    @Autowired
    lateinit var constellationRepository: ConstellationRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var transactionTemplate: TransactionTemplate


    private val userId = UUID.randomUUID()
    private val t0: Instant = Instant.now().truncatedTo(ChronoUnit.MICROS)

    @Test
    fun `replacing a note's set swaps the main without tripping the one-main index`() {
        val note = note("Kind of Blue")
        val music = root("Music")
        val films = root("Films")
        replace(note.id, NoteMembership(music.id, true, t0), NoteMembership(films.id, false, t0.plusSeconds(1)))

        replace(note.id, NoteMembership(films.id, true, t0.plusSeconds(1)), NoteMembership(music.id, false, t0))

        assertEquals(
            listOf(NoteMembership(films.id, true, t0.plusSeconds(1)), NoteMembership(music.id, false, t0)),
            store.findByNote(userId, note.id),
        )
        replace(note.id)
        assertTrue(store.findByNote(userId, note.id).isEmpty())
    }

    @Test
    fun `replacing requires a transaction`() {
        assertFailsWith<IllegalTransactionStateException> { store.replace(userId, mapOf(UUID.randomUUID() to emptyList())) }
    }

    @Test
    fun `memberships of another user's note are not read`() {
        val note = note("Kind of Blue")
        replace(note.id, NoteMembership(root("Music").id, true, t0))

        assertTrue(store.findByNote(UUID.randomUUID(), note.id).isEmpty())
    }

    @Test
    fun `notes touching a branch come with all their memberships`() {
        val music = root("Music")
        val jazz = child(music.id, "Jazz")
        val films = root("Films")
        val inJazz = note("Kind of Blue")
        val alsoInFilms = note("Round Midnight")
        val onlyFilms = note("Stalker")
        replace(inJazz.id, NoteMembership(jazz.id, true, t0))
        replace(alsoInFilms.id, NoteMembership(films.id, true, t0), NoteMembership(jazz.id, false, t0.plusSeconds(1)))
        replace(onlyFilms.id, NoteMembership(films.id, true, t0))

        val touched = store.findByNotesInConstellations(userId, listOf(music.id, jazz.id))

        assertEquals(setOf(inJazz.id, alsoInFilms.id), touched.keys)
        assertEquals(listOf(films.id, jazz.id), touched.getValue(alsoInFilms.id).map { it.constellationId })
        assertTrue(store.findByNotesInConstellations(UUID.randomUUID(), listOf(jazz.id)).isEmpty())
    }

    @Test
    fun `counts are distinct notes of the subtree and of the node itself`() {
        val music = root("Music")
        val jazz = child(music.id, "Jazz")
        val miles = child(jazz.id, "Miles")
        val films = root("Films")
        val both = note("Kind of Blue")
        val deep = note("Bitches Brew")
        replace(both.id, NoteMembership(jazz.id, true, t0), NoteMembership(miles.id, false, t0))
        replace(deep.id, NoteMembership(miles.id, true, t0), NoteMembership(films.id, false, t0))

        val counts = store.countNotes(userId).associateBy { it.constellationId }

        assertEquals(ConstellationNoteCount(music.id, 2, 0), counts[music.id])
        assertEquals(ConstellationNoteCount(jazz.id, 2, 1), counts[jazz.id])
        assertEquals(ConstellationNoteCount(miles.id, 2, 2), counts[miles.id])
        assertEquals(ConstellationNoteCount(films.id, 1, 1), counts[films.id])
        assertTrue(store.countNotes(UUID.randomUUID()).isEmpty())
    }

    @Test
    fun `notes here are the node's own notes, newest first`() {
        val music = root("Music")
        val jazz = child(music.id, "Jazz")
        val older = note("Kind of Blue")
        val newer = note("A Love Supreme")
        val deeper = note("Bitches Brew")
        replace(older.id, NoteMembership(music.id, true, t0))
        replace(newer.id, NoteMembership(music.id, false, t0), NoteMembership(jazz.id, true, t0))
        replace(deeper.id, NoteMembership(jazz.id, true, t0))

        assertEquals(
            listOf(newer.id, older.id),
            noteRepository.findInConstellation(userId, music.id).map { it.id },
        )
        assertTrue(noteRepository.findInConstellation(UUID.randomUUID(), music.id).isEmpty())
    }

    @Test
    fun `notes without a constellation are unplaced top notes with all their sub-notes, newest first`() {
        val placed = note("Kind of Blue")
        replace(placed.id, NoteMembership(root("Music").id, true, t0))
        val underPlaced = note("Under the placed one")
        parent(underPlaced.id, placed.id)
        val loose = note("Loose thought")
        val newerLoose = note("Another one")
        val subNote = note("Under the loose one")
        val subSubNote = note("Deeper still")
        parent(subNote.id, loose.id)
        parent(subSubNote.id, subNote.id)
        noteRepository.save(NoteEntity(UUID.randomUUID(), "foreign"))

        assertEquals(
            listOf(subSubNote.id, subNote.id, newerLoose.id, loose.id),
            noteRepository.findWithoutConstellation(userId).map { it.id },
        )
    }

    @Test
    fun `notes here come with all sub-notes of the node's own notes`() {
        val music = root("Music")
        val jazz = child(music.id, "Jazz")
        val bowie = note("Bowie")
        val low = note("Low")
        val warszawa = note("Warszawa")
        val deeper = note("Kind of Blue")
        val deeperChild = note("So What")
        replace(bowie.id, NoteMembership(music.id, true, t0))
        replace(deeper.id, NoteMembership(jazz.id, true, t0))
        parent(low.id, bowie.id)
        parent(warszawa.id, low.id)
        parent(deeperChild.id, deeper.id)

        assertEquals(
            listOf(warszawa.id, low.id, bowie.id),
            noteRepository.findInConstellation(userId, music.id).map { it.id },
        )
    }

    @Test
    fun `counts include sub-notes, each note once per subtree`() {
        val music = root("Music")
        val rock = child(music.id, "Rock")
        val jazz = child(music.id, "Jazz")
        val bowie = note("Bowie")
        val low = note("Low")
        val warszawa = note("Warszawa")
        val both = note("Kind of Blue")
        val bothChild = note("So What")
        val loose = note("Loose")
        val looseChild = note("Under loose")
        replace(bowie.id, NoteMembership(rock.id, true, t0))
        replace(both.id, NoteMembership(jazz.id, true, t0), NoteMembership(rock.id, false, t0))
        parent(low.id, bowie.id)
        parent(warszawa.id, low.id)
        parent(bothChild.id, both.id)
        parent(looseChild.id, loose.id)

        val counts = store.countNotes(userId).associateBy { it.constellationId }

        assertEquals(ConstellationNoteCount(music.id, 5, 0), counts[music.id])
        assertEquals(ConstellationNoteCount(rock.id, 5, 5), counts[rock.id])
        assertEquals(ConstellationNoteCount(jazz.id, 2, 2), counts[jazz.id])
    }

    @Test
    fun `memberships of several notes are read at once, only for the owner`() {
        val music = root("Music")
        val films = root("Films")
        val bowie = note("Bowie")
        val stalker = note("Stalker")
        val loose = note("Loose")
        replace(bowie.id, NoteMembership(music.id, false, t0), NoteMembership(films.id, true, t0.plusSeconds(1)))
        replace(stalker.id, NoteMembership(films.id, true, t0))

        val found = store.findByNotes(userId, listOf(bowie.id, stalker.id, loose.id))

        assertEquals(setOf(bowie.id, stalker.id), found.keys)
        assertEquals(listOf(films.id, music.id), found.getValue(bowie.id).map { it.constellationId })
        assertTrue(store.findByNotes(UUID.randomUUID(), listOf(bowie.id)).isEmpty())
        assertTrue(store.findByNotes(userId, emptyList()).isEmpty())
    }

    @Test
    fun `a note maps its parent note`() {
        val parent = note("Bowie")
        val child = note("Low")
        jdbcTemplate.update("UPDATE note.notes SET parent_note_id = ? WHERE id = ?", parent.id, child.id)

        assertEquals(parent.id, noteRepository.findByIdAndUserId(child.id, userId)?.parentNoteId)
    }

    private fun parent(noteId: UUID, parentId: UUID) {
        jdbcTemplate.update("UPDATE note.notes SET parent_note_id = ? WHERE id = ?", parentId, noteId)
    }

    private fun replace(noteId: UUID, vararg memberships: NoteMembership) {
        transactionTemplate.executeWithoutResult { store.replace(userId, mapOf(noteId to memberships.toList())) }
    }

    private fun note(title: String): NoteEntity = noteRepository.saveAndFlush(NoteEntity(userId, "body", title = title))

    private fun root(name: String): ConstellationEntity =
        constellationRepository.saveAndFlush(ConstellationEntity(userId, null, name, 264, null))

    private fun child(parentId: UUID, name: String): ConstellationEntity =
        constellationRepository.saveAndFlush(ConstellationEntity(userId, parentId, name, null, ConstellationLightness.LIGHT))
}
