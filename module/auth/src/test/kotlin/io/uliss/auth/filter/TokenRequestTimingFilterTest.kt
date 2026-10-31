package io.uliss.auth.filter

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import jakarta.servlet.http.HttpServlet
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TokenRequestTimingFilterTest {

    private val filterLogger = LoggerFactory.getLogger(TokenRequestTimingFilter::class.java) as Logger
    private val logEvents = ListAppender<ILoggingEvent>()
    private val clock = SteppingClock(Instant.parse("2026-10-31T17:29:24Z"))

    @BeforeEach
    fun attachAppender() {
        logEvents.start()
        filterLogger.addAppender(logEvents)
    }

    @AfterEach
    fun detachAppender() {
        filterLogger.detachAppender(logEvents)
    }

    @Test
    fun `logs the grant type, status and duration of a token request without its secrets`() {
        val request = MockHttpServletRequest("POST", "/oauth2/token").apply {
            addParameter("grant_type", "refresh_token")
            addParameter("refresh_token", "secret-refresh-token")
            addHeader("Authorization", "Basic c2VjcmV0LWNsaWVudA==")
        }
        val chain = MockFilterChain(object : HttpServlet() {
            override fun service(req: HttpServletRequest, res: HttpServletResponse) {
                clock.advance(Duration.ofMillis(4_500))
                res.status = 400
            }
        })

        TokenRequestTimingFilter(clock).doFilter(request, MockHttpServletResponse(), chain)

        val event = logEvents.list.single()
        assertEquals(Level.INFO, event.level)
        val message = event.formattedMessage
        assertTrue("refresh_token" in message, message)
        assertTrue("400" in message, message)
        assertTrue("4500 ms" in message, message)
        assertFalse("secret" in message, message)
        assertFalse("c2VjcmV0" in message, message)
    }

    private class SteppingClock(private var now: Instant) : Clock() {
        fun advance(duration: Duration) {
            now = now.plus(duration)
        }

        override fun instant(): Instant = now
        override fun getZone(): ZoneOffset = ZoneOffset.UTC
        override fun withZone(zone: java.time.ZoneId): Clock = this
    }
}
