package io.uliss.note_service.repository

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.ConstellationEntity
import io.uliss.note_service.model.ConstellationLightness
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.projection.ConstellationNoteCount
import io.uliss.note_service.model.projection.NoteMembership
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.ai.chat.client.ChatClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.transaction.IllegalTransactionStateException
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class NoteConstellationStoreIntegrationTest {

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

    @MockitoBean
    lateinit var chatClient: ChatClient

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
    fun `notes without a constellation leave out placed notes, sub-notes and other users' notes`() {
        val placed = note("Kind of Blue")
        replace(placed.id, NoteMembership(root("Music").id, true, t0))
        val loose = note("Loose thought")
        val newerLoose = note("Another one")
        val subNote = note("Under the loose one")
        jdbcTemplate.update("UPDATE note.notes SET parent_note_id = ? WHERE id = ?", loose.id, subNote.id)
        noteRepository.save(NoteEntity(UUID.randomUUID(), "foreign"))

        assertEquals(
            listOf(newerLoose.id, loose.id),
            noteRepository.findWithoutConstellation(userId).map { it.id },
        )
    }

    @Test
    fun `a note maps its parent note`() {
        val parent = note("Bowie")
        val child = note("Low")
        jdbcTemplate.update("UPDATE note.notes SET parent_note_id = ? WHERE id = ?", parent.id, child.id)

        assertEquals(parent.id, noteRepository.findByIdAndUserId(child.id, userId)?.parentNoteId)
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
