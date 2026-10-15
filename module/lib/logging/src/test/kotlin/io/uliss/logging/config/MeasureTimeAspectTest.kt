package io.uliss.logging.config

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.uliss.logging.annotation.MeasureTime
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory
import kotlin.test.assertEquals
import kotlin.test.assertIs

open class TimedService {
    @MeasureTime
    open fun work(): String = "done"
}

class MeasureTimeAspectTest {

    private val logger = LoggerFactory.getLogger(TimedService::class.java) as Logger
    private val appender = ListAppender<ILoggingEvent>()
    private lateinit var service: TimedService

    @BeforeEach
    fun setUp() {
        appender.start()
        logger.addAppender(appender)
        logger.level = Level.DEBUG
        service = AspectJProxyFactory(TimedService()).apply { addAspect(MeasureTimeAspect()) }.getProxy()
    }

    @AfterEach
    fun tearDown() {
        logger.detachAppender(appender)
        logger.level = null
    }

    @Test
    fun `logs execution time to the declaring class logger with method and elapsed fields`() {
        assertEquals("done", service.work())

        val event = appender.list.single()
        assertEquals(TimedService::class.java.name, event.loggerName)
        assertEquals("execution time", event.formattedMessage)
        val keyValues = event.keyValuePairs.associate { it.key to it.value }
        assertEquals("work", keyValues["method"])
        assertIs<Long>(keyValues["elapsed_ms"])
    }
}
