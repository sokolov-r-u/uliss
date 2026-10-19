package io.uliss.note_service.service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.exception.ConstellationNotFoundException
import io.uliss.note_service.exception.NoteHasSubNotesException
import io.uliss.note_service.exception.NoteMoveCycleException
import io.uliss.note_service.exception.ParentNoteNotFoundException
import io.uliss.note_service.model.ConstellationEntity
import io.uliss.note_service.model.ConstellationLightness
import io.uliss.note_service.model.SubNoteFate
import io.uliss.note_service.model.projection.NoteMembership
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.http.HttpStatus
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NoteHierarchyServiceTest {

    private val now: Instant = Instant.parse("2026-10-19T12:00:00Z")
    private val earlier: Instant = Instant.parse("2026-10-19T10:00:00Z")
    private val userId = UUID.randomUUID()
    private val constellations = InMemoryConstellationStore()
    private val memberships = InMemoryNoteConstellationStore()
    private val notes = InMemoryNoteHierarchyStore(memberships)
    private val service = NoteHierarchyService(
        notes.store,
        constellations.repository,
        memberships.store,
        Clock.fixed(now, ZoneOffset.UTC),
    )

    private val music = constellation()
    private val rock = constellation(parentId = music)
    private val films = constellation()
    private val bowie = notes.add(userId, "Bowie")
    private val low = notes.add(userId, "Low", parentId = bowie)
    private val warszawa = notes.add(userId, "Warszawa", parentId = low)
    private val loose = notes.add(userId, "Loose thought")

    init {
        memberships.put(userId, bowie, listOf(NoteMembership(rock, true, earlier), NoteMembership(films, false, now)))
        memberships.put(userId, loose, listOf(NoteMembership(films, true, earlier)))
    }

    @Test
    fun `moving under a note drops the note's own places and inherits the parent's, under the tree lock`() {
        val place = service.moveUnder(userId, loose, warszawa)

        assertEquals(warszawa, notes.parentOf(loose))
        assertNull(memberships.rows[loose])
        assertEquals(listOf("Bowie", "Low", "Warszawa"), place.ancestors.map { it.title })
        assertEquals(listOf(rock to true, films to false), place.memberships.map { it.constellationId to it.main })
        Mockito.verify(constellations.repository).lockUserTree(userId)
    }

    @Test
    fun `moving under the current parent changes nothing`() {
        service.moveUnder(userId, low, bowie)

        Mockito.verify(notes.store, Mockito.never()).setParent(anyValue(), anyValue(), Mockito.any())
        Mockito.verify(memberships.store, Mockito.never()).replace(anyValue(), anyValue())
    }

    @Test
    fun `a note cannot move under itself or its descendants`() {
        for (target in listOf(bowie, low, warszawa)) {
            val error = assertFailsWith<NoteMoveCycleException> { service.moveUnder(userId, bowie, target) }
            assertEquals(HttpStatus.CONFLICT, error.httpStatus)
            assertEquals("NOTE_MOVE_CYCLE", error.code)
        }
        assertNull(notes.parentOf(bowie))
        assertEquals(2, memberships.rows.getValue(bowie).size)
    }

    @Test
    fun `a missing or foreign parent is its own not found, a missing or foreign note the plain one`() {
        val foreign = notes.add(UUID.randomUUID(), "Foreign")

        val error = assertFailsWith<ParentNoteNotFoundException> { service.moveUnder(userId, loose, foreign) }
        assertEquals("PARENT_NOTE_NOT_FOUND", error.code)
        assertFailsWith<ParentNoteNotFoundException> { service.moveUnder(userId, loose, UUID.randomUUID()) }
        assertFailsWith<NotFoundException> { service.moveUnder(userId, foreign, bowie) }
            .also { assertTrue(it !is ParentNoteNotFoundException) }
        assertNull(notes.parentOf(loose))
    }

    @Test
    fun `moving out to a constellation makes it the only, main place`() {
        val place = service.moveOut(userId, low, films)

        assertNull(notes.parentOf(low))
        assertEquals(listOf(NoteMembership(films, true, now)), memberships.rows[low])
        assertTrue(place.ancestors.isEmpty())
        assertEquals(listOf(NoteMembership(films, true, now)), place.memberships)
        // Its own sub-notes stay under it and now live in Films.
        assertEquals(low, notes.parentOf(warszawa))
    }

    @Test
    fun `moving out without a target leaves the note without a place`() {
        val place = service.moveOut(userId, warszawa, null)

        assertNull(notes.parentOf(warszawa))
        assertNull(memberships.rows[warszawa])
        assertTrue(place.ancestors.isEmpty() && place.memberships.isEmpty())
    }

    @Test
    fun `moving out a top note changes nothing`() {
        val place = service.moveOut(userId, loose, rock)

        assertEquals(listOf(films to true), place.memberships.map { it.constellationId to it.main })
        Mockito.verify(memberships.store, Mockito.never()).replace(anyValue(), anyValue())
    }

    @Test
    fun `moving out to a missing or foreign constellation changes nothing`() {
        val foreign = constellations.add(ConstellationEntity(UUID.randomUUID(), null, "Foreign", 22, null)).id

        assertFailsWith<ConstellationNotFoundException> { service.moveOut(userId, low, foreign) }
        assertEquals(bowie, notes.parentOf(low))
    }

    @Test
    fun `a note's place is its ancestors and the memberships of its top note`() {
        val place = service.getPlace(userId, warszawa)

        assertEquals(listOf(bowie, low), place.ancestors.map { it.id })
        assertEquals(listOf(rock, films), place.memberships.map { it.constellationId })
        assertEquals(listOf(films), service.getPlace(userId, loose).memberships.map { it.constellationId })
        assertFailsWith<NotFoundException> { service.getPlace(UUID.randomUUID(), warszawa) }
    }

    @Test
    fun `search finds titled notes with their path and leaves out the moving note's subtree`() {
        val hits = service.search(userId, "w", exclude = null)

        // Prefix matches first, then the newest.
        assertEquals(listOf(warszawa, low, bowie), hits.map { it.note.id })
        assertEquals(listOf(bowie, low), hits.first().ancestors.map { it.id })
        assertEquals(listOf(rock, rock, rock), hits.map { it.constellationId })
        assertEquals(films, service.search(userId, "loose", exclude = null).single().constellationId)
        assertEquals(listOf(bowie), service.search(userId, "w", exclude = low).map { it.note.id })
        assertTrue(service.search(UUID.randomUUID(), "w", exclude = null).isEmpty())
    }

    @Test
    fun `a note without sub-notes is deleted whatever the choice`() {
        service.delete(userId, loose, null)
        service.delete(userId, warszawa, SubNoteFate.DELETE)

        assertEquals(setOf(bowie, low), notes.nodes.keys)
        assertNull(memberships.rows[loose])
    }

    @Test
    fun `a note with sub-notes asks for a choice and keeps everything`() {
        val error = assertFailsWith<NoteHasSubNotesException> { service.delete(userId, low, null) }

        assertEquals(HttpStatus.CONFLICT, error.httpStatus)
        assertEquals("NOTE_HAS_SUB_NOTES", error.code)
        assertEquals(4, notes.nodes.size)
    }

    @Test
    fun `kept sub-notes of a sub-note move up to its parent`() {
        service.delete(userId, low, SubNoteFate.KEEP)

        assertEquals(bowie, notes.parentOf(warszawa))
        assertEquals(setOf(bowie, warszawa, loose), notes.nodes.keys)
        assertNull(memberships.rows[warszawa])
    }

    @Test
    fun `kept sub-notes of a top note become top notes with a copy of its places`() {
        val heroes = notes.add(userId, "Heroes", parentId = bowie)

        service.delete(userId, bowie, SubNoteFate.KEEP)

        assertNull(notes.parentOf(low))
        assertNull(notes.parentOf(heroes))
        val copied = listOf(NoteMembership(rock, true, earlier), NoteMembership(films, false, now))
        assertEquals(copied, memberships.rows[low])
        assertEquals(copied, memberships.rows[heroes])
        assertEquals(low, notes.parentOf(warszawa))
        assertNull(memberships.rows[bowie])
    }

    @Test
    fun `deleting all removes the whole subtree only`() {
        service.delete(userId, bowie, SubNoteFate.DELETE)

        assertEquals(setOf(loose), notes.nodes.keys)
        assertNull(memberships.rows[bowie])
        Mockito.verify(constellations.repository).lockUserTree(userId)
    }

    @Test
    fun `deleting a missing or foreign note is not found`() {
        assertFailsWith<NotFoundException> { service.delete(UUID.randomUUID(), loose, SubNoteFate.DELETE) }
        assertTrue(loose in notes.nodes)
    }

    private fun constellation(parentId: UUID? = null): UUID = constellations.add(
        if (parentId == null) ConstellationEntity(userId, null, "Root ${constellations.rows.size}", 22, null)
        else ConstellationEntity(userId, parentId, "Child ${constellations.rows.size}", null, ConstellationLightness.LIGHT)
    ).id
}
