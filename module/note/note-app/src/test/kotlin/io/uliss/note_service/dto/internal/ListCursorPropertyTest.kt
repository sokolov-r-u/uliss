package io.uliss.note_service.dto.internal

import io.uliss.exception.common.BadRequestException
import net.jqwik.api.Arbitraries
import net.jqwik.api.Arbitrary
import net.jqwik.api.Combinators
import net.jqwik.api.Example
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.Provide
import java.time.Instant
import java.util.Base64
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ListCursorPropertyTest {

    @Property(tries = 500)
    fun `a cursor survives encoding and decoding`(@ForAll("cursors") cursor: ListCursor) {
        assertEquals(cursor, ListCursor.decode(cursor.encode()))
    }

    @Property(tries = 200)
    fun `an encoded cursor is URL-safe`(@ForAll("cursors") cursor: ListCursor) {
        assertTrue(cursor.encode().all { it.isLetterOrDigit() || it == '-' || it == '_' }, cursor.encode())
    }

    @Property(tries = 300)
    fun `arbitrary text is either a cursor or a bad request, never another failure`(@ForAll text: String) {
        try {
            ListCursor.decode(text)
        } catch (_: BadRequestException) {
        }
    }

    @Example
    fun `garbage cursors are bad requests`() {
        val encoder = Base64.getUrlEncoder().withoutPadding()
        listOf(
            "",
            "not base64 !",
            encoder.encodeToString("no-separator".toByteArray()),
            encoder.encodeToString("abc|${UUID.randomUUID()}".toByteArray()),
            encoder.encodeToString("123|not-a-uuid".toByteArray()),
            encoder.encodeToString("${Long.MAX_VALUE}|${UUID.randomUUID()}".toByteArray()),
        ).forEach { assertFailsWith<BadRequestException>(it) { ListCursor.decode(it) } }
    }

    @Provide
    fun cursors(): Arbitrary<ListCursor> = Combinators.combine(
        // Postgres TIMESTAMPTZ keeps microseconds, so a cursor read from the database never carries finer precision.
        Arbitraries.longs().between(-62_135_596_800L, 253_402_300_799L),
        Arbitraries.longs().between(0, 999_999),
        Arbitraries.create { UUID.randomUUID() },
    ).`as` { seconds, micros, id -> ListCursor(Instant.ofEpochSecond(seconds, micros * 1_000), id) }
}
