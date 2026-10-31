package io.uliss.auth.config

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

/** Replaces the application clock with one a test moves forward, e.g. past the refresh-token grace window. */
@TestConfiguration(proxyBeanMethods = false)
class MutableClockConfiguration {

    @Bean
    @Primary
    fun mutableClock(): MutableClock = MutableClock()
}

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
