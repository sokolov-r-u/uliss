package io.uliss.auth.config

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary

/** Replaces the application clock with one a test moves forward, e.g. past the refresh-token grace window. */
@TestConfiguration(proxyBeanMethods = false)
class MutableClockConfiguration {

    @Bean
    @Primary
    fun mutableClock(): MutableClock = MutableClock()
}
