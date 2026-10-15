package io.uliss.logging.config

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.uliss.logging.annotation.Sensitive
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
    open fun exchange(@Sensitive code: String, clientId: String): String = "ok:$clientId"
    open fun echo(text: String): String = text
    open fun find(id: String?): String? = id
    open fun accept(value: Any): String = "accepted"
    open fun fail(): String = throw IllegalStateException("boom")
}

class BrokenToString {
    override fun toString(): String = throw IllegalStateException("toString failed")
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

    private fun keyValues(index: Int) =
        appender.list[index].keyValuePairs.orEmpty().associate { it.key to it.value.toString() }

    @Test
    fun `logs call and result with argument names`() {
        service.echo("hello")

        assertEquals(listOf("call", "finish"), messages())
        assertEquals(mapOf("method" to "echo", "args" to "text=hello"), keyValues(0))
        assertEquals(mapOf("method" to "echo", "result" to "hello"), keyValues(1))
    }

    @Test
    fun `masks secret arguments by parameter name`() {
        service.refresh("secret-refresh", "web")

        val args = keyValues(0).getValue("args")
        assertFalse("secret-refresh" in args, args)
        assertContains(args, "refreshToken=***")
        assertContains(args, "clientId=web")
    }

    @Test
    fun `masks arguments annotated as sensitive`() {
        service.exchange("one-time-code", "web")

        val args = keyValues(0).getValue("args")
        assertFalse("one-time-code" in args, args)
        assertContains(args, "code=***")
        assertContains(args, "clientId=web")
    }

    @Test
    fun `truncates long values`() {
        service.echo("x".repeat(2_000))

        val args = keyValues(0).getValue("args")
        val result = keyValues(1).getValue("result")
        assertTrue(args.length < 1_000 && result.length < 1_000, "${args.length}, ${result.length}")
        assertContains(args, "(2000 chars)")
    }

    @Test
    fun `logs an exception once at debug without a stack trace and rethrows it`() {
        assertThrows<IllegalStateException> { service.fail() }

        val exit = appender.list.single { it.formattedMessage == "exit" }
        assertEquals(Level.DEBUG, exit.level)
        assertEquals(mapOf("method" to "fail", "exception" to "IllegalStateException"), keyValues(1))
        assertNull(exit.throwableProxy)
        assertFalse(appender.list.any { it.level == Level.ERROR })
    }

    @Test
    fun `logs nothing when debug is disabled`() {
        logger.level = Level.INFO

        service.echo("hello")

        assertTrue(appender.list.isEmpty())
    }

    @Test
    fun `renders null arguments and results instead of failing the call`() {
        assertNull(service.find(null))

        assertEquals(mapOf("method" to "find", "args" to "id=null"), keyValues(0))
        assertEquals(mapOf("method" to "find", "result" to "null"), keyValues(1))
    }

    @Test
    fun `a failing toString never breaks the call`() {
        assertEquals("accepted", service.accept(BrokenToString()))

        assertEquals("value=<unrenderable: IllegalStateException>", keyValues(0).getValue("args"))
        assertEquals("accepted", keyValues(1).getValue("result"))
    }
}
