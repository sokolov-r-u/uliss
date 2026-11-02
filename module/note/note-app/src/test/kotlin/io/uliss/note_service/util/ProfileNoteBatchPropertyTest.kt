package io.uliss.note_service.util

import io.uliss.note_service.model.projection.ProfileNote
import net.jqwik.api.Arbitraries
import net.jqwik.api.Arbitrary
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.Provide
import net.jqwik.api.constraints.IntRange
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ProfileNoteBatchPropertyTest {

    @Property(tries = 500)
    fun `taking batches until none is left reads every note once, in order, each batch non-empty and within budget`(
        @ForAll("notes") notes: List<ProfileNote>,
        @ForAll @IntRange(min = 1, max = 300) maxChars: Int,
    ) {
        var rest = notes
        val read = mutableListOf<ProfileNote>()
        while (rest.isNotEmpty()) {
            val batch = ProfileNoteBatch.take(rest, maxChars)
            assertTrue(batch.isNotEmpty(), "a batch always makes progress")
            assertTrue(batch.sumOf { ProfileNoteBatch.size(it) } <= maxChars, "a batch fits the budget")
            read += batch
            rest = rest.drop(batch.size)
        }
        assertEquals(notes.map { it.id }, read.map { it.id })
        read.zip(notes).forEach { (got, original) ->
            assertTrue(original.content.startsWith(got.content), "only a too long note is cut, from its end")
        }
    }

    @Provide
    fun notes(): Arbitrary<List<ProfileNote>> {
        val note = Arbitraries.strings().ofMaxLength(400).flatMap { content ->
            Arbitraries.strings().ofMaxLength(60).injectNull(0.2).map { title ->
                ProfileNote(UUID.randomUUID(), title, content, Instant.EPOCH)
            }
        }
        return note.list().ofMaxSize(30)
    }
}
