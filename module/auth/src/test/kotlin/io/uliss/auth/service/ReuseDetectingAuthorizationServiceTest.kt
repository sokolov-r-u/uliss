package io.uliss.auth.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.test.assertSame
import kotlin.test.assertTrue

class ReuseDetectingAuthorizationServiceTest {

    private val serviceLogger = LoggerFactory.getLogger(ReuseDetectingAuthorizationService::class.java) as Logger
    private val logEvents = ListAppender<ILoggingEvent>()
    private var previousLevel: Level? = null
    private val clock = SteppingClock(Instant.parse("2026-10-31T17:29:24Z"))

    @BeforeEach
    fun attachAppender() {
        previousLevel = serviceLogger.level
        serviceLogger.level = Level.DEBUG
        logEvents.start()
        serviceLogger.addAppender(logEvents)
    }

    @AfterEach
    fun detachAppender() {
        serviceLogger.detachAppender(logEvents)
        serviceLogger.level = previousLevel
    }

    @Test
    fun `logs how long finding an authorization by refresh token took`() {
        val authorization = Mockito.mock(OAuth2Authorization::class.java)
        val delegate = FindingDelegate(authorization) { clock.advance(Duration.ofMillis(4_200)) }
        val service = ReuseDetectingAuthorizationService(delegate, JdbcTemplate(), clock, TransactionTemplate())

        val found = service.findByToken("secret-refresh-token", OAuth2TokenType.REFRESH_TOKEN)

        assertSame(authorization, found)
        val message = logEvents.list.single { it.level == Level.DEBUG }.formattedMessage
        assertTrue("found=true" in message, message)
        assertTrue("4200 ms" in message, message)
        assertTrue("secret" !in message, message)
    }

    /** Answers every lookup with one authorization after running [onFind]; only lookups are used here. */
    private class FindingDelegate(
        private val authorization: OAuth2Authorization,
        private val onFind: () -> Unit,
    ) : OAuth2AuthorizationService {
        override fun findByToken(token: String, tokenType: OAuth2TokenType?): OAuth2Authorization {
            onFind()
            return authorization
        }

        override fun save(authorization: OAuth2Authorization) = throw UnsupportedOperationException()
        override fun remove(authorization: OAuth2Authorization) = throw UnsupportedOperationException()
        override fun findById(id: String): OAuth2Authorization? = throw UnsupportedOperationException()
    }

    private class SteppingClock(private var now: Instant) : Clock() {
        fun advance(duration: Duration) {
            now = now.plus(duration)
        }

        override fun instant(): Instant = now
        override fun getZone(): ZoneOffset = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = this
    }
}
