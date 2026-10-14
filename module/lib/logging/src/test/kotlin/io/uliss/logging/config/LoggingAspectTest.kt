package io.uliss.logging.config

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.slf4j.LoggerFactory
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory
import org.springframework.stereotype.Service
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@Service
open class SampleService {
    open fun refresh(refreshToken: String, clientId: String): String = "ok:$clientId"
    open fun echo(text: String): String = text
    open fun fail(): String = throw IllegalStateException("boom")
}

class LoggingAspectTest {

    private val logger = LoggerFactory.getLogger(SampleService::class.java) as Logger
    private val appender = ListAppender<ILoggingEvent>()
    private lateinit var service: SampleService

    @BeforeEach
    fun setUp() {
        appender.start()
        logger.addAppender(appender)
        logger.level = Level.DEBUG
        service = AspectJProxyFactory(SampleService()).apply { addAspect(LoggingAspect()) }.getProxy()
    }

    @AfterEach
    fun tearDown() {
        logger.detachAppender(appender)
        logger.level = null
    }

    private fun messages() = appender.list.map { it.formattedMessage }

    @Test
    fun `logs call and result with argument names`() {
        service.echo("hello")

        assertContains(messages()[0], "SampleService.echo")
        assertContains(messages()[0], "text=hello")
        assertContains(messages()[1], "return value='hello'")
    }

    @Test
    fun `masks secret arguments by parameter name`() {
        service.refresh("secret-refresh", "web")

        assertFalse(messages().any { "secret-refresh" in it }, messages().toString())
        assertContains(messages()[0], "refreshToken=***")
        assertContains(messages()[0], "clientId=web")
    }

    @Test
    fun `truncates long values`() {
        service.echo("x".repeat(2_000))

        assertTrue(messages().all { it.length < 1_000 }, messages().map { it.length }.toString())
        assertContains(messages()[0], "(2000 chars)")
    }

    @Test
    fun `logs an exception once at debug without a stack trace and rethrows it`() {
        assertThrows<IllegalStateException> { service.fail() }

        val exit = appender.list.single { "exit" in it.formattedMessage }
        assertEquals(Level.DEBUG, exit.level)
        assertContains(exit.formattedMessage, "IllegalStateException")
        assertNull(exit.throwableProxy)
        assertFalse(appender.list.any { it.level == Level.ERROR })
    }

    @Test
    fun `logs nothing when debug is disabled`() {
        logger.level = Level.INFO

        service.echo("hello")

        assertTrue(appender.list.isEmpty())
    }
}
