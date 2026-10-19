package io.uliss.note_service.util

import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.model.projection.NoteNode
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

class NoteRemovalPropertyTest {

    /** A forest where node i hangs under parents[i] (-1: a top note), the places of each note, and the note to delete. */
    data class Scenario(val parents: List<Int>, val places: List<Set<Int>>, val deleted: Int)

    @Property(tries = 500)
    fun `kept sub-notes keep the place they lived in, and the notes stay acyclic`(@ForAll("scenarios") scenario: Scenario) {
        var parents = scenario.parents.mapIndexed { i, parent -> IDS[i] to parent.takeIf { it >= 0 }?.let(IDS::get) }.toMap()
        // Only top notes have places of their own.
        val memberships = scenario.places.mapIndexedNotNull { i, places ->
            val placed = places.sorted().mapIndexed { order, c -> NoteMembership(CONSTELLATIONS[c], order == 0, T0.plusSeconds(order.toLong())) }
            (IDS[i] to placed).takeIf { scenario.parents[i] < 0 && placed.isNotEmpty() }
        }.toMap().toMutableMap()
        val deleted = IDS[scenario.deleted]
        val hierarchy = hierarchy(parents)
        val before = IDS.filter { it != deleted }.associateWith { placeOf(hierarchy, memberships, it) }

        val adoption = NoteRemoval.keepSubNotes(hierarchy, deleted, memberships[deleted].orEmpty())

        assertEquals(hierarchy.childrenOf(deleted).map { it.id }.toSet(), adoption.childIds.toSet())
        parents = (parents - deleted).mapValues { (id, parent) -> if (id in adoption.childIds) adoption.parentNoteId else parent }
        memberships.remove(deleted)
        memberships.putAll(adoption.memberships)
        val after = hierarchy(parents)
        IDS.filter { it != deleted }.forEach { id ->
            assertEquals(before[id], placeOf(after, memberships, id), "place of note ${IDS.indexOf(id)}")
            assertTrue(after.ancestorsOf(id).none { it.id == id })
        }
        adoption.memberships.values.forEach { if (it.isNotEmpty()) assertEquals(1, it.count { m -> m.main }) }
    }

    /** The memberships a note lives in: its top note's. */
    private fun placeOf(hierarchy: NoteHierarchy, memberships: Map<UUID, List<NoteMembership>>, id: UUID) =
        memberships[hierarchy.rootOf(id).id].orEmpty().toSet()

    private fun hierarchy(parents: Map<UUID, UUID?>) =
        NoteHierarchy(parents.map { (id, parent) -> NoteNode(id, parent, "note", T0) })

    @Provide
    fun scenarios(): Arbitrary<Scenario> {
        val parents = Combinators.combine(List(IDS.size) { i -> Arbitraries.integers().between(-1, i - 1) })
            .`as` { it.toList() }
        val places = Arbitraries.integers().between(0, CONSTELLATIONS.size - 1).set().ofMaxSize(3).list().ofSize(IDS.size)
        return Combinators.combine(parents, places, Arbitraries.integers().between(0, IDS.size - 1)).`as`(::Scenario)
    }

    private companion object {
        val IDS: List<UUID> = List(7) { UUID.randomUUID() }
        val CONSTELLATIONS: List<UUID> = List(4) { UUID.randomUUID() }
        val T0: Instant = Instant.parse("2026-10-19T10:00:00Z")
    }
}
