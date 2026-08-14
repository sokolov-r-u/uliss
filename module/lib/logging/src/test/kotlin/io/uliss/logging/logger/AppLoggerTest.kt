package io.uliss.logging.logger

import org.mockito.ArgumentMatchers.eq
import org.mockito.Mockito
import org.slf4j.Logger
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AppLoggerTest {

    private val logger = Mockito.mock(Logger::class.java)
    private val appLogger = AppLogger(logger, AppLoggerTest::class)

    @Test
    fun `debug invokes lazy message and logs it when debug is enabled`() {
        Mockito.`when`(logger.isDebugEnabled).thenReturn(true)
        var invoked = false

        appLogger.debug("method") {
            invoked = true
            "hello"
        }

        assertTrue(invoked)
        Mockito.verify(logger).debug(
            eq("method='{}.{}' message='hello'"),
            eq(AppLoggerTest::class),
            eq("method"),
        )
    }

    @Test
    fun `debug never invokes lazy message when debug is disabled`() {
        Mockito.`when`(logger.isDebugEnabled).thenReturn(false)
        var invoked = false

        appLogger.debug("method") {
            invoked = true
            "hello"
        }

        assertFalse(invoked)
        Mockito.verify(logger, Mockito.never()).debug(Mockito.anyString(), Mockito.any(), Mockito.any())
    }

    @Test
    fun `info passes message and varargs through to logger`() {
        appLogger.info("message", "method", "arg1", "arg2")

        Mockito.verify(logger).info(
            eq("method='{}.{}' message='message'"),
            eq(AppLoggerTest::class),
            eq("method"),
            eq("arg1"),
            eq("arg2"),
        )
    }

    @Test
    fun `warn passes message and varargs through to logger`() {
        appLogger.warn("message", "method", "arg1")

        Mockito.verify(logger).warn(
            eq("method='{}.{}' message='message'"),
            eq(AppLoggerTest::class),
            eq("method"),
            eq("arg1"),
        )
    }

    @Test
    fun `warn with throwable uses inline template and passes exception`() {
        val ex = RuntimeException("boom")

        appLogger.warn("message", "method", ex)

        Mockito.verify(logger).warn(
            eq("method='${AppLoggerTest::class}.method' message='message'"),
            eq(ex),
        )
    }

    @Test
    fun `error passes message and varargs through to logger`() {
        appLogger.error("message", "method", "arg1")

        Mockito.verify(logger).error(
            eq("method='{}.{}' message='message'"),
            eq(AppLoggerTest::class),
            eq("method"),
            eq("arg1"),
        )
    }

    @Test
    fun `error with throwable uses inline template and passes exception`() {
        val ex = RuntimeException("boom")

        appLogger.error("message", "method", ex)

        Mockito.verify(logger).error(
            eq("method='${AppLoggerTest::class}.method' message='message'"),
            eq(ex),
        )
    }

    @Test
    fun `of factory builds a usable AppLogger bound to given class`() {
        val built = AppLogger.of(AppLoggerTest::class)

        built.info("smoke", "method")
    }
}
