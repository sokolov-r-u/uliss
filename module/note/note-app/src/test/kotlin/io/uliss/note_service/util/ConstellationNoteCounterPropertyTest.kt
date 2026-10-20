package io.uliss.note_service.util

import io.uliss.note_service.model.projection.ConstellationNoteCount
import net.jqwik.api.Arbitraries
import net.jqwik.api.Arbitrary
import net.jqwik.api.Combinators
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.Provide
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

class ConstellationNoteCounterPropertyTest {

    /** A random forest (each node's parent is an earlier node or none) and random note placements in it. */
    data class Case(val parents: Map<UUID, UUID?>, val placements: List<Pair<UUID, UUID>>)

    @Property(tries = 300)
    fun `counts equal the definition on any forest`(@ForAll("cases") case: Case) {
        assertEquals(bruteForce(case).toSet(), ConstellationNoteCounter.count(case.parents, case.placements).toSet())
    }

    @Test
    fun `a note placed twice in one subtree counts once there`() {
        val music = UUID.randomUUID()
        val jazz = UUID.randomUUID()
        val rock = UUID.randomUUID()
        val note = UUID.randomUUID()

        val counts = ConstellationNoteCounter.count(
            mapOf(music to null, jazz to music, rock to music),
            listOf(note to jazz, note to rock),
        ).associateBy { it.constellationId }

        assertEquals(ConstellationNoteCount(music, 1, 0), counts[music])
        assertEquals(ConstellationNoteCount(jazz, 1, 1), counts[jazz])
    }

    @Test
    fun `a deep chain is counted in time linear in its placements times depth`() {
        // 2,000 nested constellations: the old recursive query produced ~2 million rows for this
        val chain = List(2_000) { UUID.randomUUID() }
        val parents = chain.mapIndexed { index, id -> id to chain.getOrNull(index - 1) }.toMap()

        val counts = ConstellationNoteCounter.count(parents, listOf(UUID.randomUUID() to chain.last()))

        assertEquals(2_000, counts.size)
        assertEquals(true, counts.all { it.noteCount == 1 })
    }

    @Provide
    fun cases(): Arbitrary<Case> = Arbitraries.integers().between(0, 12).flatMap { size ->
        val nodes = List(size) { UUID.randomUUID() }
        val parentIndexes = Arbitraries.integers().between(-1, 11).list().ofSize(size)
        val placements = Combinators.combine(Arbitraries.integers().between(0, 5), Arbitraries.integers().between(0, 11))
            .`as` { note, node -> note to node }.list().ofMaxSize(20)
        val notes = List(6) { UUID.randomUUID() }
        Combinators.combine(parentIndexes, placements).`as` { parentsAt, placed ->
            val parents = nodes.mapIndexed { index, id ->
                val parent = parentsAt[index]
                id to if (parent in 0 until index) nodes[parent] else null
            }.toMap()
            val pairs = if (nodes.isEmpty()) emptyList() else placed.map { (note, node) -> notes[note] to nodes[node % nodes.size] }
            Case(parents, pairs)
        }
    }

    private fun bruteForce(case: Case): List<ConstellationNoteCount> {
        fun ancestorsOrSelf(id: UUID): List<UUID> = generateSequence(id) { case.parents[it] }.toList()
        return case.parents.keys.mapNotNull { id ->
            val subtree = case.placements.filter { (_, at) -> id in ancestorsOrSelf(at) }.map { it.first }.toSet()
            val own = case.placements.filter { it.second == id }.map { it.first }.toSet()
            if (subtree.isEmpty()) null else ConstellationNoteCount(id, subtree.size, own.size)
        }
    }
}
