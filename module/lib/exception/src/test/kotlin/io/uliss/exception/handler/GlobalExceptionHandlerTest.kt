package io.uliss.exception.handler

import org.hamcrest.Matchers
import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.annotation.CookieValue
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.client.ResourceAccessException

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
    }

    private val mockMvc: MockMvc = MockMvcBuilders.standaloneSetup(FailingController())
        .setControllerAdvice(GlobalExceptionHandler())
        .build()

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
}
