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

    /** Key values without the timing, which is not deterministic. */
    private fun untimedKeyValues(index: Int) = keyValues(index) - DURATION_KEY

    @Test
    fun `logs one line per call with argument names, result and duration`() {
        service.echo("hello")

        assertEquals(listOf("call"), messages())
        assertEquals(mapOf("method" to "echo", "args" to "text=hello", "result" to "hello"), untimedKeyValues(0))
        assertTrue(keyValues(0).getValue(DURATION_KEY).toLong() >= 0)
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
        val result = keyValues(0).getValue("result")
        assertTrue(args.length < 1_000 && result.length < 1_000, "${args.length}, ${result.length}")
        assertContains(args, "(2000 chars)")
    }

    @Test
    fun `logs an exception once at debug without a stack trace and rethrows it`() {
        assertThrows<IllegalStateException> { service.fail() }

        val failed = appender.list.single()
        assertEquals("call failed", failed.formattedMessage)
        assertEquals(Level.DEBUG, failed.level)
        assertEquals(mapOf("method" to "fail", "args" to "", "exception" to "IllegalStateException"), untimedKeyValues(0))
        assertTrue(keyValues(0).getValue(DURATION_KEY).toLong() >= 0)
        assertNull(failed.throwableProxy)
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

        assertEquals(mapOf("method" to "find", "args" to "id=null", "result" to "null"), untimedKeyValues(0))
    }

    @Test
    fun `a failing toString never breaks the call`() {
        assertEquals("accepted", service.accept(BrokenToString()))

        assertEquals("value=<unrenderable: IllegalStateException>", keyValues(0).getValue("args"))
        assertEquals("accepted", keyValues(0).getValue("result"))
    }

    private companion object {
        const val DURATION_KEY = "durationMs"
    }
}
