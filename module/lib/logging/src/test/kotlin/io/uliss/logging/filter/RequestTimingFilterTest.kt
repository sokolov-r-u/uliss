package io.uliss.logging.filter

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.time.Clock
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RequestTimingFilterTest {

    private val filterLogger = LoggerFactory.getLogger(RequestTimingFilter::class.java) as Logger
    private val logEvents = ListAppender<ILoggingEvent>()

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
    fun `logs only the parameters it was told are safe, never other parameters or headers`() {
        val request = MockHttpServletRequest("POST", "/oauth2/token").apply {
            addParameter("grant_type", "refresh_token")
            addParameter("refresh_token", "secret-refresh-token")
            addParameter("code_verifier", "secret-verifier")
            addHeader("Authorization", "Basic c2VjcmV0LWNsaWVudA==")
        }

        RequestTimingFilter(Clock.systemUTC(), setOf("grant_type")).doFilter(request, MockHttpServletResponse(), MockFilterChain())

        val message = logEvents.list.single().formattedMessage
        assertTrue("grant_type=refresh_token" in message, message)
        assertFalse("secret" in message, message)
        assertFalse("c2VjcmV0" in message, message)
    }
}
