package io.uliss.exception.handler

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.uliss.exception.common.NotFoundException
import org.hamcrest.Matchers
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.annotation.CookieValue
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.client.ResourceAccessException
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class GlobalExceptionHandlerTest {

    @RestController
    class FailingController {
        @GetMapping("/unexpected")
        fun unexpected(): String = throw IllegalStateException("duplicate key value violates constraint uq_secret")

        @GetMapping("/unavailable")
        fun unavailable(): String =
            throw ResourceAccessException("I/O error on POST request for http://auth:9000/oauth2/token")

        @GetMapping("/cookie")
        fun cookie(@CookieValue("code_verifier") verifier: String): String = verifier

        @PostMapping("/stream/missing", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
        fun streamMissing(): String = throw NotFoundException("chat id=42 not found")

        @PostMapping("/stream/unexpected", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
        fun streamUnexpected(): String = throw IllegalStateException("boom")
    }

    private val mockMvc: MockMvc = MockMvcBuilders.standaloneSetup(FailingController())
        .setControllerAdvice(GlobalExceptionHandler())
        .build()

    private val handlerLogger = LoggerFactory.getLogger(GlobalExceptionHandler::class.java) as Logger
    private val logEvents = ListAppender<ILoggingEvent>()

    @BeforeEach
    fun attachAppender() {
        logEvents.start()
        handlerLogger.addAppender(logEvents)
    }

    @AfterEach
    fun detachAppender() {
        handlerLogger.detachAppender(logEvents)
    }

    @Test
    fun `unexpected exception returns 500 without its internal message`() {
        mockMvc.get("/unexpected").andExpect {
            status { isInternalServerError() }
            jsonPath("$.code") { value("UNKNOWN_ERROR") }
            jsonPath("$.details") { isEmpty() }
            content { string(Matchers.not(Matchers.containsString("uq_secret"))) }
        }
    }

    @Test
    fun `unavailable downstream returns 503 without its internal address`() {
        mockMvc.get("/unavailable").andExpect {
            status { isServiceUnavailable() }
            jsonPath("$.code") { value("INTERNAL_ERROR") }
            jsonPath("$.details") { isEmpty() }
            content { string(Matchers.not(Matchers.containsString("auth:9000"))) }
        }
    }

    @Test
    fun `client error keeps its explanatory message`() {
        mockMvc.get("/cookie").andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("BAD_REQUEST_ERROR") }
            jsonPath("$.details.message") { value(Matchers.containsString("code_verifier")) }
        }
    }

    @Test
    fun `client error on an event stream endpoint keeps its status and json body`() {
        mockMvc.post("/stream/missing") { accept = MediaType.TEXT_EVENT_STREAM }.andExpect {
            status { isNotFound() }
            content { contentTypeCompatibleWith(MediaType.APPLICATION_JSON) }
            jsonPath("$.code") { value("NOT_FOUND_ERROR") }
        }
    }

    @Test
    fun `server error on an event stream endpoint returns a json 500`() {
        mockMvc.post("/stream/unexpected") { accept = MediaType.TEXT_EVENT_STREAM }.andExpect {
            status { isInternalServerError() }
            content { contentTypeCompatibleWith(MediaType.APPLICATION_JSON) }
            jsonPath("$.code") { value("UNKNOWN_ERROR") }
        }
    }

    @Test
    fun `client error is logged at info without a stack trace`() {
        mockMvc.get("/cookie").andExpect { status { isBadRequest() } }

        val event = logEvents.list.single()
        assertEquals(Level.INFO, event.level)
        assertEquals(null, event.throwableProxy)
    }

    @Test
    fun `server error is logged at error with its stack trace`() {
        mockMvc.get("/unexpected").andExpect { status { isInternalServerError() } }

        val event = logEvents.list.single()
        assertEquals(Level.ERROR, event.level)
        assertNotNull(event.throwableProxy)
    }
}
