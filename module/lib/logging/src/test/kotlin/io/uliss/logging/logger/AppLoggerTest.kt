package io.uliss.logging.logger

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.slf4j.LoggerFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AppLoggerTest {

    private val logger = LoggerFactory.getLogger(AppLoggerTest::class.java) as Logger
    private val appender = ListAppender<ILoggingEvent>()
    private val appLogger = AppLogger.of(AppLoggerTest::class)

    @BeforeEach
    fun setUp() {
        appender.start()
        logger.addAppender(appender)
        logger.level = Level.DEBUG
    }

    @AfterEach
    fun tearDown() {
        logger.detachAppender(appender)
        logger.level = null
    }

    private fun event() = appender.list.single()

    private fun ILoggingEvent.keyValues() = keyValuePairs.orEmpty().associate { it.key to it.value }

    @Test
    fun `debug logs lazy message with method as a separate key value`() {
        appLogger.debug("load") { "hello" }

        assertEquals(Level.DEBUG, event().level)
        assertEquals("hello", event().formattedMessage)
        assertEquals(mapOf("method" to "load"), event().keyValues())
    }

    @Test
    fun `debug never invokes lazy message when debug is disabled`() {
        logger.level = Level.INFO
        var invoked = false

        appLogger.debug("load") {
            invoked = true
            "hello"
        }

        assertFalse(invoked)
        assertTrue(appender.list.isEmpty())
    }

    @Test
    fun `info formats message template with args and keeps method out of the message`() {
        appLogger.info("deleted {} of {}", "cleanup", 3, 5)

        assertEquals(Level.INFO, event().level)
        assertEquals("deleted 3 of 5", event().formattedMessage)
        assertEquals(mapOf("method" to "cleanup"), event().keyValues())
    }

    @Test
    fun `warn formats message template with args`() {
        appLogger.warn("rejected {}", "refresh", 401)

        assertEquals(Level.WARN, event().level)
        assertEquals("rejected 401", event().formattedMessage)
        assertEquals(mapOf("method" to "refresh"), event().keyValues())
        assertNull(event().throwableProxy)
    }

    @Test
    fun `warn with throwable attaches the exception`() {
        val ex = RuntimeException("boom")

        appLogger.warn("failed", "refresh", ex)

        assertEquals("failed", event().formattedMessage)
        assertEquals(mapOf("method" to "refresh"), event().keyValues())
        assertEquals("boom", event().throwableProxy.message)
    }

    @Test
    fun `error formats message template with args`() {
        appLogger.error("failed id={}", "poll", 7)

        assertEquals(Level.ERROR, event().level)
        assertEquals("failed id=7", event().formattedMessage)
        assertEquals(mapOf("method" to "poll"), event().keyValues())
    }

    @Test
    fun `error with throwable attaches the exception`() {
        val ex = IllegalStateException("boom")

        appLogger.error("failed", "poll", ex)

        assertEquals(Level.ERROR, event().level)
        assertEquals("failed", event().formattedMessage)
        assertEquals(mapOf("method" to "poll"), event().keyValues())
        assertEquals(IllegalStateException::class.java.name, event().throwableProxy.className)
    }

    @Test
    fun `of binds the logger to the given class`() {
        appLogger.info("smoke", "method")

        assertEquals(AppLoggerTest::class.java.name, event().loggerName)
    }
}
