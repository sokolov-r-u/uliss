package io.uliss.note_service.outbox

import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.constraints.DoubleRange
import net.jqwik.api.constraints.IntRange
import org.junit.jupiter.api.Test
import java.time.Duration
import kotlin.math.min
import kotlin.math.pow
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class OutboxBackoffTest {

    @Test
    fun `the random draw spreads the first retry between 24 and 36 seconds`() {
        assertEquals(Duration.ofSeconds(24), OutboxBackoff.delayAfter(attempts = 1, random = 0.0))
        assertEquals(Duration.ofSeconds(30), OutboxBackoff.delayAfter(attempts = 1, random = 0.5))
        assertEquals(Duration.ofSeconds(36), OutboxBackoff.delayAfter(attempts = 1, random = 1.0))
    }

    @Test
    fun `the spread never pushes a retry past the 30 minute cap`() {
        assertEquals(Duration.ofMinutes(30), OutboxBackoff.delayAfter(attempts = 20, random = 1.0))
        assertEquals(Duration.ofMinutes(24), OutboxBackoff.delayAfter(attempts = 20, random = 0.0))
    }

    @Property
    fun `a retry waits within 20 percent of the exponential step and at most 30 minutes`(
        @ForAll @IntRange(min = 1, max = 40) attempts: Int,
        @ForAll @DoubleRange(min = 0.0, max = 1.0, maxIncluded = false) random: Double,
    ) {
        val step = min(30.0 * 2.0.pow(attempts - 1), 30.0 * 60)
        val delay = OutboxBackoff.delayAfter(attempts, random).toMillis() / 1000.0

        assertTrue(delay >= step * 0.8 - 0.001, "attempts=$attempts random=$random delay=$delay")
        assertTrue(delay <= min(step * 1.2, 30.0 * 60) + 0.001, "attempts=$attempts random=$random delay=$delay")
    }
}
