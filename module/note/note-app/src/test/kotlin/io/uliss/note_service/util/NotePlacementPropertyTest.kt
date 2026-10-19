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

    /** One random change: what to do, which of [IDS] it touches, and whether it replaces the main. */
    data class Step(val kind: Int, val target: Int, val branch: Set<Int>, val replace: Boolean)

    @Property(tries = 500)
    fun `any sequence of changes keeps a non-empty set with exactly one main and no duplicates`(
        @ForAll("steps") steps: List<Step>,
    ) {
        var memberships = emptyList<NoteMembership>()
        steps.forEachIndexed { index, step ->
            val now = START.plusSeconds(index.toLong())
            val target = IDS[step.target]
            memberships = when (step.kind) {
                0 -> NotePlacement.add(memberships, target, now)
                1 -> NotePlacement.remove(memberships, target)
                2 -> NotePlacement.makeMain(memberships, target, step.replace, now)
                else -> {
                    val branch = step.branch.map { IDS[it] }.toSet()
                    NotePlacement.withoutBranch(memberships, branch, target.takeUnless { it in branch }, now)
                }
            }
            val ids = memberships.map { it.constellationId }
            assertEquals(ids.toSet().size, ids.size, "no duplicate memberships")
            if (memberships.isNotEmpty()) assertEquals(1, memberships.count { it.main }, "exactly one main")
        }
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
        val step = Combinators.combine(
            Arbitraries.integers().between(0, 3),
            index,
            index.set().ofMaxSize(3),
            Arbitraries.of(true, false),
        ).`as` { kind, target, branch, replace -> Step(kind, target, branch, replace) }
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
