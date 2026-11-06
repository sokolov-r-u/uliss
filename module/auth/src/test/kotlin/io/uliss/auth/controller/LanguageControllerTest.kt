package io.uliss.auth.controller

import io.uliss.auth.config.TestContainersConfiguration
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class LanguageControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `choosing a language stores it and returns to the same tab`() {
        mockMvc.get("/lang") {
            param("to", "ru")
            param("from", "register")
        }
            .andExpect {
                status { isFound() }
                redirectedUrl("/register")
                cookie {
                    value("uliss_lang", "ru")
                    path("uliss_lang", "/")
                    httpOnly("uliss_lang", false)
                }
            }
    }

    @Test
    fun `an unsupported language is refused and changes nothing`() {
        mockMvc.get("/lang") {
            param("to", "de")
            param("from", "login")
        }
            .andExpect {
                status { isBadRequest() }
                header { doesNotExist("Set-Cookie") }
            }
    }

    @ParameterizedTest
    @ValueSource(strings = ["https://evil.example", "//evil.example", "oauth2/authorize", ""])
    fun `any other return page goes to sign-in, never elsewhere`(from: String) {
        mockMvc.get("/lang") {
            param("to", "en")
            param("from", from)
        }
            .andExpect { redirectedUrl("/login") }
    }

    @Test
    fun `without a return page the switch goes to sign-in`() {
        mockMvc.get("/lang") { param("to", "en") }
            .andExpect { redirectedUrl("/login") }
    }
}
