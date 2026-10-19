package io.uliss.note_service.util

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

class NoteHierarchyPropertyTest {

    /** A forest where node i hangs under parents[i] (-1: a top note), and moves of node to a new parent (-1: out). */
    data class Scenario(val parents: List<Int>, val moves: List<Pair<Int, Int>>)

    @Property(tries = 500)
    fun `a move is allowed exactly when it keeps the notes acyclic, and allowed moves never close a cycle`(
        @ForAll("scenarios") scenario: Scenario,
    ) {
        val parents = scenario.parents.toMutableList()
        for ((note, target) in scenario.moves) {
            val hierarchy = hierarchy(parents)
            val allowed = target < 0 || hierarchy.canMoveUnder(IDS[note], IDS[target])
            val candidate = parents.toMutableList().also { it[note] = target }

            assertEquals(isAcyclic(candidate), allowed, "move $note under $target in $parents")
            if (allowed) parents[note] = target
            assertTrue(isAcyclic(parents))
        }
    }

    @Property(tries = 300)
    fun `ancestors and subtrees agree, a note lies in the subtree of each of its ancestors`(
        @ForAll("scenarios") scenario: Scenario,
    ) {
        val hierarchy = hierarchy(scenario.parents)
        for (id in IDS) {
            val ancestors = hierarchy.ancestorsOf(id)
            ancestors.forEach { assertTrue(id in hierarchy.subtreeIds(it.id)) }
            assertEquals(ancestors.firstOrNull() ?: hierarchy.find(id), hierarchy.rootOf(id))
            assertEquals(null, hierarchy.rootOf(id).parentNoteId)
        }
    }

    /** Follows parent links from every node; a walk longer than the node count went round a cycle. */
    private fun isAcyclic(parents: List<Int>): Boolean = parents.indices.all { start ->
        var current = start
        var steps = 0
        while (parents[current] >= 0) {
            current = parents[current]
            if (++steps > parents.size) return@all false
        }
        true
    }

    private fun hierarchy(parents: List<Int>) = NoteHierarchy(
        parents.mapIndexed { i, parent -> NoteNode(IDS[i], parent.takeIf { it >= 0 }?.let(IDS::get), "note $i", T0) },
    )

    @Provide
    fun scenarios(): Arbitrary<Scenario> {
        // A parent always has a smaller index, so the starting forest is acyclic.
        val parents = Combinators.combine(List(IDS.size) { i -> Arbitraries.integers().between(-1, i - 1) })
            .`as` { it.toList() }
        val index = Arbitraries.integers().between(0, IDS.size - 1)
        val target = Arbitraries.integers().between(-1, IDS.size - 1)
        val moves = Combinators.combine(index, target).`as` { note, parent -> note to parent }.list().ofMaxSize(25)
        return Combinators.combine(parents, moves).`as`(::Scenario)
    }

    private companion object {
        val IDS: List<UUID> = List(7) { UUID.randomUUID() }
        val T0: Instant = Instant.parse("2026-10-19T10:00:00Z")
    }
}
