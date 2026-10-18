package io.uliss.note_service.service

import io.uliss.exception.common.ServerException
import io.uliss.note_service.model.ConstellationEntity
import net.jqwik.api.Arbitraries
import net.jqwik.api.Arbitrary
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.Provide
import java.util.Locale
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

class ConstellationTreePropertyTest {

    /** One random step: what to do, which existing nodes it touches, and which name it uses. */
    data class Step(val kind: Int, val first: Int, val second: Int, val name: Int)

    @Property(tries = 300)
    fun `any sequence of tree changes keeps the tree acyclic, owned and named uniquely among siblings`(
        @ForAll("steps") steps: List<Step>,
    ) {
        val store = InMemoryConstellationStore()
        val service = ConstellationService(store.repository)
        val userId = UUID.randomUUID()

        for (step in steps) {
            val ids = store.rows.keys.toList()
            val pick = { index: Int -> if (ids.isEmpty() || index % (ids.size + 1) == ids.size) null else ids[index % (ids.size + 1)] }
            try {
                when (step.kind) {
                    0 -> service.create(userId, NAMES[step.name], pick(step.first))
                    1 -> pick(step.first)?.let { service.move(userId, it, pick(step.second)) }
                    2 -> pick(step.first)?.let { service.update(userId, it, NAMES[step.name], null, null) }
                    else -> pick(step.first)?.let { service.delete(userId, it) }
                }
            } catch (_: ServerException) {
                // Refused changes are part of the walk; the invariants must hold either way.
            }
            assertInvariants(store.rows.values.toList())
        }
    }

    @Provide
    fun steps(): Arbitrary<List<Step>> {
        val index = Arbitraries.integers().between(0, 20)
        val step = net.jqwik.api.Combinators.combine(
            Arbitraries.integers().between(0, 3),
            index,
            index,
            Arbitraries.integers().between(0, NAMES.size - 1),
        ).`as` { kind, first, second, name -> Step(kind, first, second, name) }
        return step.list().ofMaxSize(40)
    }

    private fun assertInvariants(rows: List<ConstellationEntity>) {
        val byId = rows.associateBy { it.id }
        for (row in rows) {
            var current: ConstellationEntity = row
            var steps = 0
            while (current.parentId != null) {
                current = byId[current.parentId] ?: fail("dangling parent of ${row.name}")
                if (++steps > rows.size) fail("cycle through ${row.name}")
            }
            if (row.parentId == null) {
                assertTrue(row.hue != null && row.lightness == null, "root colour of $row")
            } else {
                assertTrue(row.hue == null && row.lightness != null, "sub-constellation colour of $row")
            }
        }
        rows.groupBy { it.parentId }.values.forEach { siblings ->
            val names = siblings.map { it.name.lowercase(Locale.ROOT) }
            assertEquals(names.size, names.toSet().size, "sibling names $names")
        }
    }

    private companion object {
        val NAMES = listOf("Music", "music", "Jazz", "Films", "JAZZ")
    }
}
