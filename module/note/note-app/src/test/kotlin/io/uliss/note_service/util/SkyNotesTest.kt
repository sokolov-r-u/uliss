package io.uliss.note_service.util

import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.model.projection.SkyNoteRow
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SkyNotesTest {

    private val t0 = Instant.parse("2026-10-20T10:00:00Z")
    private val rock = UUID.randomUUID()
    private val films = UUID.randomUUID()

    @Test
    fun `only ready titled notes become stars, oldest first`() {
        val late = row("Late", order = 3)
        val early = row("Early", order = 1)
        val generating = row("Draft", order = 2, status = NoteStatus.GENERATING)
        val failed = row("Broken", order = 4, status = NoteStatus.FAILED)
        val untitled = row(null, order = 5)

        val stars = SkyNotes.stars(listOf(late, early, generating, failed, untitled), emptyMap())

        assertEquals(listOf(early.id, late.id), stars.map { it.id })
        assertEquals("Early", stars.first().title)
        assertTrue(stars.all { it.memberships.isEmpty() && it.parentNoteId == null })
    }

    @Test
    fun `a top note keeps its memberships main first, a sub-note keeps its parent and has none`() {
        val bowie = row("Bowie", order = 0)
        val low = row("Low", order = 1, parent = bowie.id)
        val memberships = mapOf(
            bowie.id to listOf(membership(films, main = false, order = 1), membership(rock, main = true, order = 0)),
        )

        val stars = SkyNotes.stars(listOf(bowie, low), memberships).associateBy { it.id }

        assertEquals(listOf(rock, films), stars.getValue(bowie.id).memberships.map { it.constellationId })
        assertEquals(bowie.id, stars.getValue(low.id).parentNoteId)
        assertTrue(stars.getValue(low.id).memberships.isEmpty())
    }

    @Test
    fun `a sub-note under a note that is not a star hangs under the nearest star above it`() {
        val bowie = row("Bowie", order = 0)
        val draft = row("Draft", order = 1, parent = bowie.id, status = NoteStatus.GENERATING)
        val low = row("Low", order = 2, parent = draft.id)

        val stars = SkyNotes.stars(listOf(bowie, draft, low), emptyMap()).associateBy { it.id }

        assertEquals(setOf(bowie.id, low.id), stars.keys)
        assertEquals(bowie.id, stars.getValue(low.id).parentNoteId)
    }

    @Test
    fun `a star with no star above it takes the place of its top note`() {
        val bowie = row("Bowie", order = 0, status = NoteStatus.GENERATING)
        val low = row("Low", order = 1, parent = bowie.id)
        val main = membership(rock, main = true, order = 0)

        val stars = SkyNotes.stars(listOf(bowie, low), mapOf(bowie.id to listOf(main)))

        assertEquals(1, stars.size)
        assertEquals(null, stars.single().parentNoteId)
        assertEquals(listOf(main), stars.single().memberships)
    }

    @Test
    fun `a parent missing from the snapshot or a corrupted cycle never loops and leaves the star on top`() {
        val orphan = row("Orphan", order = 0, parent = UUID.randomUUID())
        val aId = UUID.randomUUID()
        val bId = UUID.randomUUID()
        val a = SkyNoteRow(aId, bId, "A", NoteStatus.GENERATING, t0)
        val b = SkyNoteRow(bId, aId, "B", NoteStatus.GENERATING, t0)
        val c = row("C", order = 1, parent = aId)

        val stars = SkyNotes.stars(listOf(orphan, a, b, c), emptyMap()).associateBy { it.id }

        assertEquals(setOf(orphan.id, c.id), stars.keys)
        assertEquals(null, stars.getValue(orphan.id).parentNoteId)
        assertEquals(null, stars.getValue(c.id).parentNoteId)
    }

    private fun row(
        title: String?,
        order: Long,
        parent: UUID? = null,
        status: NoteStatus = NoteStatus.READY,
    ) = SkyNoteRow(UUID.randomUUID(), parent, title, status, t0.plusSeconds(order))

    private fun membership(constellationId: UUID, main: Boolean, order: Long) =
        NoteMembership(constellationId, main, t0.plusSeconds(order))
}
