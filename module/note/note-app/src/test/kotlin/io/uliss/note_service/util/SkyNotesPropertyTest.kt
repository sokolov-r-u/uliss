package io.uliss.note_service.util

import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.model.projection.SkyNoteRow
import net.jqwik.api.Arbitraries
import net.jqwik.api.Arbitrary
import net.jqwik.api.Combinators
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.Provide
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SkyNotesPropertyTest {

    /** Note i hangs under parents[i] (-1: a top note) and is a star candidate when ready[i]. */
    data class Forest(val parents: List<Int>, val ready: List<Boolean>)

    @Property(tries = 500)
    fun `stars are exactly the ready notes, each hangs under its nearest star ancestor or carries its top note's place`(
        @ForAll("forests") forest: Forest,
    ) {
        val rows = forest.parents.indices.map { i ->
            SkyNoteRow(
                IDS[i],
                forest.parents[i].takeIf { it >= 0 }?.let(IDS::get),
                "note $i",
                if (forest.ready[i]) NoteStatus.READY else NoteStatus.GENERATING,
                T0.plusSeconds(i.toLong()),
            )
        }
        val memberships = forest.parents.indices.filter { forest.parents[it] < 0 }
            .associate { IDS[it] to listOf(NoteMembership(PLACES[it], true, T0)) }

        val stars = SkyNotes.stars(rows, memberships)
        val starIds = stars.map { it.id }.toSet()

        assertEquals(forest.ready.indices.filter { forest.ready[it] }.map(IDS::get).toSet(), starIds)
        for (star in stars) {
            val i = IDS.indexOf(star.id)
            val expectedParent = generateSequence(forest.parents[i].takeIf { it >= 0 }) {
                forest.parents[it].takeIf { p -> p >= 0 }
            }.firstOrNull { forest.ready[it] }
            assertEquals(expectedParent?.let(IDS::get), star.parentNoteId)
            if (expectedParent == null) {
                val top = generateSequence(i) { forest.parents[it].takeIf { p -> p >= 0 } }.last()
                assertEquals(listOf(PLACES[top]), star.memberships.map { it.constellationId })
            } else {
                assertTrue(star.memberships.isEmpty())
                assertTrue(star.parentNoteId in starIds)
            }
        }
    }

    @Provide
    fun forests(): Arbitrary<Forest> {
        // A parent always has a smaller index, so the forest is acyclic.
        val parents = Combinators.combine(List(IDS.size) { i -> Arbitraries.integers().between(-1, i - 1) })
            .`as` { it.toList() }
        val ready = Arbitraries.of(true, false).list().ofSize(IDS.size)
        return Combinators.combine(parents, ready).`as`(::Forest)
    }

    private companion object {
        val IDS: List<UUID> = List(8) { UUID.randomUUID() }
        val PLACES: List<UUID> = List(8) { UUID.randomUUID() }
        val T0: Instant = Instant.parse("2026-10-20T10:00:00Z")
    }
}
