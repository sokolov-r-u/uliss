package io.uliss.note_service.util

import io.uliss.note_service.model.projection.NoteMembership
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

class NotePlacementPropertyTest {

    /**
     * One random change: what to do, which of [IDS] it touches, whether it replaces the main, and a parent index per
     * node for a tree to move to (a parent always has a smaller index, so the tree is acyclic).
     */
    data class Step(val kind: Int, val target: Int, val branch: Set<Int>, val replace: Boolean, val parents: List<Int>)

    @Property(tries = 500)
    fun `any sequence of changes keeps one main and at most one membership per line of the current tree`(
        @ForAll("steps") steps: List<Step>,
    ) {
        var memberships = emptyList<NoteMembership>()
        var tree = lineage(List(IDS.size) { -1 })
        steps.forEachIndexed { index, step ->
            val now = START.plusSeconds(index.toLong())
            val target = IDS[step.target]
            memberships = when (step.kind) {
                0 -> NotePlacement.add(memberships, target, now, tree)
                1 -> NotePlacement.remove(memberships, target)
                2 -> NotePlacement.makeMain(memberships, target, step.replace, now, tree)
                3 -> {
                    val branch = step.branch.map { IDS[it] }.toSet()
                    NotePlacement.withoutBranch(memberships, branch, target.takeUnless { it in branch }, now)
                }
                else -> {
                    // The tree changes (a branch moved): the memberships adapt to the new lines.
                    tree = lineage(step.parents)
                    NotePlacement.keepDeepest(memberships, tree)
                }
            }
            val ids = memberships.map { it.constellationId }
            assertEquals(ids.toSet().size, ids.size, "no duplicate memberships")
            if (memberships.isNotEmpty()) assertEquals(1, memberships.count { it.main }, "exactly one main")
            for (a in ids) for (b in ids) assertTrue(!tree(a, b), "two memberships on one line")
        }
    }

    /** `isAncestor` of a tree where node i hangs under node parents[i] (-1 for a root). */
    private fun lineage(parents: List<Int>): (UUID, UUID) -> Boolean = { ancestor, descendant ->
        val up = generateSequence(parents[IDS.indexOf(descendant)].takeIf { it >= 0 }) { i ->
            parents[i].takeIf { it >= 0 }
        }
        up.any { IDS[it] == ancestor }
    }

    @Property(tries = 300)
    fun `removing the main promotes the oldest remaining membership`(@ForAll("sets") memberships: List<NoteMembership>) {
        val main = memberships.single { it.main }
        val rest = memberships - main

        val left = NotePlacement.remove(memberships, main.constellationId)

        assertEquals(rest.toSet(), left.map { it.copy(main = false) }.toSet())
        if (rest.isNotEmpty()) {
            val oldest = rest.minWith(compareBy<NoteMembership> { it.addedAt }.thenBy { it.constellationId })
            assertEquals(oldest.constellationId, left.single { it.main }.constellationId)
        } else {
            assertTrue(left.isEmpty())
        }
    }

    @Provide
    fun steps(): Arbitrary<List<Step>> {
        val index = Arbitraries.integers().between(0, IDS.size - 1)
        val parents = Combinators.combine(List(IDS.size) { i -> Arbitraries.integers().between(-1, i - 1) })
            .`as` { it.toList() }
        val step = Combinators.combine(
            Arbitraries.integers().between(0, 4),
            index,
            index.set().ofMaxSize(3),
            Arbitraries.of(true, false),
            parents,
        ).`as` { kind, target, branch, replace, tree -> Step(kind, target, branch, replace, tree) }
        return step.list().ofMaxSize(40)
    }

    @Provide
    fun sets(): Arbitrary<List<NoteMembership>> {
        val minutes = Arbitraries.longs().between(0, 5)
        return Combinators.combine(
            Arbitraries.integers().between(1, IDS.size).flatMap { size -> minutes.list().ofSize(size) },
            Arbitraries.integers().between(0, IDS.size - 1),
        ).`as` { added, mainIndex ->
            added.mapIndexed { i, minute ->
                NoteMembership(IDS[i], i == mainIndex % added.size, START.plusSeconds(minute * 60))
            }
        }
    }

    private companion object {
        val IDS = List(6) { UUID.randomUUID() }
        val START: Instant = Instant.parse("2026-10-19T10:00:00Z")
    }
}
