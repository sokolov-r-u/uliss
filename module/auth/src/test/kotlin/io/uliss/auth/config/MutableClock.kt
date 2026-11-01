package io.uliss.auth.config

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

/** The system clock shifted by an offset a test moves forward. */
class MutableClock : Clock() {
    @Volatile
    private var offset: Duration = Duration.ZERO

    fun advance(duration: Duration) {
        offset = offset.plus(duration)
    }

    fun reset() {
        offset = Duration.ZERO
    }

    override fun instant(): Instant = Instant.now().plus(offset)
    override fun getZone(): ZoneOffset = ZoneOffset.UTC
    override fun withZone(zone: ZoneId): Clock = this
}
