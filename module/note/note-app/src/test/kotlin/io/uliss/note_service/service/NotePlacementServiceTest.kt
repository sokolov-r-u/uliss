package io.uliss.note_service.service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.exception.NotePlaceInheritedException
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.repository.ConstellationRepository
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class NotePlacementServiceTest {

    private val now: Instant = Instant.parse("2026-10-19T12:00:00Z")
    private val earlier: Instant = Instant.parse("2026-10-19T10:00:00Z")
    private val userId = UUID.randomUUID()
    private val noteRepository = Mockito.mock(NoteRepository::class.java)
    private val constellationRepository = Mockito.mock(ConstellationRepository::class.java)
    private val memberships = InMemoryNoteConstellationStore()
    private val service = NotePlacementService(
        noteRepository,
        constellationRepository,
        memberships.store,
        Clock.fixed(now, ZoneOffset.UTC),
    )

    private val note = owned(NoteEntity(userId, "body"))
    private val music = ownedConstellation()
    private val jazz = ownedConstellation()
    private val films = ownedConstellation()

    @Test
    fun `the first constellation becomes main under the tree lock, stamped with the clock`() {
        val result = service.add(userId, note.id, music)

        assertEquals(listOf(NoteMembership(music, true, now)), result)
        assertEquals(result, memberships.rows[note.id])
        Mockito.verify(constellationRepository).lockUserTree(userId)
    }

    @Test
    fun `a later constellation joins as secondary, a repeated one changes nothing`() {
        place(NoteMembership(music, true, earlier))

        assertEquals(listOf(music to true, jazz to false), service.add(userId, note.id, jazz).map { it.pair() })
        assertEquals(listOf(music to true, jazz to false), service.add(userId, note.id, jazz).map { it.pair() })
    }

    @Test
    fun `change replaces the main and keeps the others`() {
        place(NoteMembership(music, true, earlier), NoteMembership(jazz, false, earlier.plusSeconds(1)))

        val result = service.makeMain(userId, note.id, films, replace = true)

        assertEquals(listOf(films to true, jazz to false), result.map { it.pair() })
    }

    @Test
    fun `making a secondary main keeps the previous main as secondary`() {
        place(NoteMembership(music, true, earlier), NoteMembership(jazz, false, earlier.plusSeconds(1)))

        val result = service.makeMain(userId, note.id, jazz, replace = false)

        assertEquals(listOf(jazz to true, music to false), result.map { it.pair() })
    }

    @Test
    fun `removing the main promotes the oldest remaining, removing the last leaves no place`() {
        place(
            NoteMembership(music, true, earlier),
            NoteMembership(films, false, earlier.plusSeconds(9)),
            NoteMembership(jazz, false, earlier.plusSeconds(1)),
        )

        assertEquals(listOf(jazz to true, films to false), service.remove(userId, note.id, music).map { it.pair() })
        service.remove(userId, note.id, jazz)
        assertTrue(service.remove(userId, note.id, films).isEmpty())
        assertTrue(service.getMemberships(userId, note.id).isEmpty())
    }

    @Test
    fun `memberships come main first`() {
        place(NoteMembership(jazz, false, earlier), NoteMembership(music, true, earlier.plusSeconds(5)))

        assertEquals(listOf(music, jazz), service.getMemberships(userId, note.id).map { it.constellationId })
    }

    @Test
    fun `a missing or foreign note is not found`() {
        val foreign = UUID.randomUUID()

        assertFailsWith<NotFoundException> { service.getMemberships(userId, foreign) }
        assertFailsWith<NotFoundException> { service.add(userId, foreign, music) }
        assertFailsWith<NotFoundException> { service.remove(userId, foreign, music) }
        assertFailsWith<NotFoundException> { service.makeMain(userId, foreign, music, replace = true) }
    }

    @Test
    fun `a missing or foreign constellation is not found and nothing is written`() {
        val foreign = UUID.randomUUID()

        assertFailsWith<NotFoundException> { service.add(userId, note.id, foreign) }
        assertFailsWith<NotFoundException> { service.makeMain(userId, note.id, foreign, replace = false) }
        Mockito.verify(memberships.store, Mockito.never()).replace(anyValue(), anyValue())
    }

    @Test
    fun `a sub-note inherits its place and refuses memberships of its own`() {
        val subNote = owned(NoteEntity(userId, "child", parentNoteId = note.id))

        assertFailsWith<NotePlaceInheritedException> { service.add(userId, subNote.id, music) }
        assertFailsWith<NotePlaceInheritedException> { service.remove(userId, subNote.id, music) }
        assertFailsWith<NotePlaceInheritedException> { service.makeMain(userId, subNote.id, music, replace = true) }
        Mockito.verify(memberships.store, Mockito.never()).replace(anyValue(), anyValue())
    }

    private fun NoteMembership.pair() = constellationId to main

    private fun place(vararg rows: NoteMembership) = memberships.put(userId, note.id, rows.toList())

    private fun owned(entity: NoteEntity): NoteEntity = entity.also {
        Mockito.`when`(noteRepository.findByIdAndUserId(it.id, userId)).thenReturn(it)
    }

    private fun ownedConstellation(): UUID = UUID.randomUUID().also {
        Mockito.`when`(constellationRepository.existsByIdAndUserId(it, userId)).thenReturn(true)
    }
}
