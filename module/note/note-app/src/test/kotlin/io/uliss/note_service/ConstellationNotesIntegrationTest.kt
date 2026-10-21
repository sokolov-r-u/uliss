package io.uliss.note_service

import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.repository.NoteConstellationStore
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.service.ConstellationService
import io.uliss.note_service.service.NotePlacementService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ConstellationNotesIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var constellationService: ConstellationService

    @Autowired
    lateinit var placementService: NotePlacementService

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var store: NoteConstellationStore


    private val userId = UUID.randomUUID()

    @Test
    fun `deleting a branch with placed notes moves, trims and keeps every note in one transaction`() {
        val music = constellationService.create(userId, "Music", null)
        val jazz = constellationService.create(userId, "Jazz", music.id)
        val films = constellationService.create(userId, "Films", null)
        val onlyJazz = note("Kind of Blue")
        val jazzAndFilms = note("Round Midnight")
        placementService.add(userId, onlyJazz.id, jazz.id)
        placementService.add(userId, jazzAndFilms.id, jazz.id)
        placementService.add(userId, jazzAndFilms.id, films.id)

        assertEquals(1, constellationService.getDeletionImpact(userId, jazz.id))
        assertEquals(2 to 0, constellationService.getTree(userId).single { it.id == music.id }.let { it.noteCount to it.ownNoteCount })

        constellationService.delete(userId, jazz.id, music.id)

        assertEquals(listOf(music.id to true), store.findByNote(userId, onlyJazz.id).map { it.constellationId to it.main })
        assertEquals(listOf(films.id to true), store.findByNote(userId, jazzAndFilms.id).map { it.constellationId to it.main })
        assertEquals(setOf(music.id, films.id), constellationService.getTree(userId).map { it.id }.toSet())
        assertTrue(noteRepository.existsById(onlyJazz.id) && noteRepository.existsById(jazzAndFilms.id))
    }

    @Test
    fun `adding on a taken line and moving a branch keep one place per line in the database`() {
        val music = constellationService.create(userId, "Music", null)
        val jazz = constellationService.create(userId, "Jazz", music.id)
        val rock = constellationService.create(userId, "Rock", music.id)
        val note = note("Kind of Blue")
        placementService.add(userId, note.id, music.id)

        assertEquals(listOf(jazz.id to true), placementService.add(userId, note.id, jazz.id).map { it.constellationId to it.main })
        placementService.add(userId, note.id, rock.id)
        constellationService.move(userId, rock.id, jazz.id)

        assertEquals(listOf(rock.id to true), store.findByNote(userId, note.id).map { it.constellationId to it.main })
    }

    private fun note(title: String): NoteEntity = noteRepository.saveAndFlush(NoteEntity(userId, "body", title = title))
}
