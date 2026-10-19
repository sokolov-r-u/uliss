package io.uliss.note_service.util

import io.uliss.note_service.model.projection.NoteMembership
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NotePlacementTest {

    private val music = UUID.randomUUID()
    private val jazz = UUID.randomUUID()
    private val films = UUID.randomUUID()
    private val now = Instant.parse("2026-10-19T12:00:00Z")

    private fun at(minute: Long): Instant = Instant.parse("2026-10-19T10:00:00Z").plusSeconds(minute * 60)

    @Test
    fun `the first constellation becomes main, later ones join as secondary`() {
        val first = NotePlacement.add(emptyList(), music, now)
        val second = NotePlacement.add(first, jazz, now)

        assertEquals(listOf(NoteMembership(music, true, now)), first)
        assertEquals(listOf(music to true, jazz to false), second.map { it.constellationId to it.main })
    }

    @Test
    fun `adding a constellation the note is already in changes nothing`() {
        val current = listOf(NoteMembership(music, true, at(1)), NoteMembership(jazz, false, at(2)))

        assertEquals(current, NotePlacement.add(current, jazz, now))
    }

    @Test
    fun `removing the main promotes the oldest remaining membership`() {
        val current = listOf(
            NoteMembership(music, true, at(1)),
            NoteMembership(films, false, at(5)),
            NoteMembership(jazz, false, at(3)),
        )

        val left = NotePlacement.remove(current, music)

        assertEquals(listOf(jazz to true, films to false), left.map { it.constellationId to it.main })
    }

    @Test
    fun `equal added times promote the smallest constellation id`() {
        val (low, high) = listOf(jazz, films).sorted()
        val current = listOf(
            NoteMembership(music, true, at(1)),
            NoteMembership(high, false, at(2)),
            NoteMembership(low, false, at(2)),
        )

        assertEquals(low, NotePlacement.remove(current, music).single { it.main }.constellationId)
    }

    @Test
    fun `removing a secondary keeps the main, removing the last leaves nothing, removing a stranger changes nothing`() {
        val current = listOf(NoteMembership(music, true, at(1)), NoteMembership(jazz, false, at(2)))

        assertEquals(listOf(NoteMembership(music, true, at(1))), NotePlacement.remove(current, jazz))
        assertTrue(NotePlacement.remove(listOf(NoteMembership(music, true, at(1))), music).isEmpty())
        assertEquals(current, NotePlacement.remove(current, films))
    }

    @Test
    fun `making a secondary main keeps the previous main as secondary`() {
        val current = listOf(NoteMembership(music, true, at(1)), NoteMembership(jazz, false, at(2)))

        val changed = NotePlacement.makeMain(current, jazz, replace = false, now = now)

        assertEquals(listOf(jazz to true, music to false), changed.map { it.constellationId to it.main })
        assertEquals(at(2), changed.first().addedAt)
    }

    @Test
    fun `replacing the main drops the previous main and adds a new constellation as main`() {
        val current = listOf(NoteMembership(music, true, at(1)), NoteMembership(jazz, false, at(2)))

        val changed = NotePlacement.makeMain(current, films, replace = true, now = now)

        assertEquals(listOf(films to true, jazz to false), changed.map { it.constellationId to it.main })
        assertEquals(now, changed.first().addedAt)
    }

    @Test
    fun `replacing the main with a secondary lifts it and drops the previous main`() {
        val current = listOf(NoteMembership(music, true, at(1)), NoteMembership(jazz, false, at(2)))

        val changed = NotePlacement.makeMain(current, jazz, replace = true, now = now)

        assertEquals(listOf(NoteMembership(jazz, true, at(2))), changed)
    }

    @Test
    fun `making the current main main again changes nothing, even when replacing`() {
        val current = listOf(NoteMembership(music, true, at(1)), NoteMembership(jazz, false, at(2)))

        assertEquals(current, NotePlacement.makeMain(current, music, replace = true, now = now))
        assertEquals(current, NotePlacement.makeMain(current, music, replace = false, now = now))
    }

    @Test
    fun `making main a note without places adds the constellation as main`() {
        assertEquals(
            listOf(NoteMembership(music, true, now)),
            NotePlacement.makeMain(emptyList(), music, replace = true, now = now),
        )
    }

    @Test
    fun `a deleted branch drops its memberships and promotes the oldest one outside it`() {
        val current = listOf(
            NoteMembership(jazz, true, at(1)),
            NoteMembership(films, false, at(4)),
            NoteMembership(music, false, at(2)),
        )

        val left = NotePlacement.withoutBranch(current, setOf(jazz), moveTo = films, now = now)

        assertEquals(listOf(music to true, films to false), left.map { it.constellationId to it.main })
    }

    @Test
    fun `a note only inside the deleted branch moves to the target as main, or loses its place without one`() {
        val current = listOf(NoteMembership(jazz, true, at(1)), NoteMembership(music, false, at(2)))

        assertEquals(
            listOf(NoteMembership(films, true, now)),
            NotePlacement.withoutBranch(current, setOf(music, jazz), moveTo = films, now = now),
        )
        assertTrue(NotePlacement.withoutBranch(current, setOf(music, jazz), moveTo = null, now = now).isEmpty())
    }

    @Test
    fun `needs a move only when every membership lies inside the branch`() {
        val inside = listOf(NoteMembership(jazz, true, at(1)), NoteMembership(music, false, at(2)))

        assertTrue(NotePlacement.needsMove(inside, setOf(music, jazz)))
        assertEquals(false, NotePlacement.needsMove(inside, setOf(jazz)))
        assertEquals(false, NotePlacement.needsMove(emptyList(), setOf(jazz)))
    }

    @Test
    fun `memberships are ordered main first, then by added time`() {
        val ordered = NotePlacement.ordered(
            listOf(
                NoteMembership(films, false, at(3)),
                NoteMembership(jazz, true, at(5)),
                NoteMembership(music, false, at(1)),
            )
        )

        assertEquals(listOf(jazz, music, films), ordered.map { it.constellationId })
    }
}
