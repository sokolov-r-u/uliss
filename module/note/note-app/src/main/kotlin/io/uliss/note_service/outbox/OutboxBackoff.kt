package io.uliss.note_service.outbox

import java.time.Duration
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToLong

private const val BASE_BACKOFF_MS = 30_000.0
private const val MAX_BACKOFF_MS = 30 * 60_000.0
private const val JITTER = 0.2

/**
 * Delay before an outbox event that failed its [attempts]-th attempt is retried: 30 s doubling up to 30 min, spread by
 * ±20% with [random] in `[0, 1)` so events that failed together (e.g. a provider outage) do not retry together.
 */
object OutboxBackoff {

    fun delayAfter(attempts: Int, random: Double): Duration {
        val step = min(BASE_BACKOFF_MS * 2.0.pow(attempts - 1), MAX_BACKOFF_MS)
        val spread = step * (1 - JITTER + 2 * JITTER * random)
        return Duration.ofMillis(min(spread, MAX_BACKOFF_MS).roundToLong())
    }
}
