package io.uliss.auth.controller

import io.uliss.auth.config.TestContainersConfiguration
import jakarta.servlet.http.Cookie
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class AuthPagesLanguageTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `the language cookie renders the sign-in page in Russian`() {
        mockMvc.get("/login") { cookie(Cookie("uliss_lang", "ru")) }
            .andExpect {
                status { isOk() }
                content {
                    string(containsString("<html lang=\"ru\">"))
                    string(containsString("Вернитесь к своему небу"))
                }
            }
    }

    @Test
    fun `without the cookie the page follows the browser's language`() {
        mockMvc.get("/register") { header("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8") }
            .andExpect {
                content {
                    string(containsString("<html lang=\"ru\">"))
                    string(containsString("<title>Регистрация · Uliss</title>"))
                }
            }
    }

    @Test
    fun `the cookie wins over the browser's language`() {
        mockMvc.get("/login") {
            cookie(Cookie("uliss_lang", "en"))
            header("Accept-Language", "ru")
        }
            .andExpect {
                content {
                    string(containsString("<html lang=\"en\">"))
                    string(containsString("Return to your sky"))
                }
            }
    }

    @Test
    fun `registration errors are in Russian`() {
        mockMvc.post("/register") {
            cookie(Cookie("uliss_lang", "ru"))
            with(csrf())
            param("email", "not-an-email")
            param("password", "short")
        }
            .andExpect {
                status { isOk() }
                content {
                    string(containsString("Исправьте отмеченные поля."))
                    string(containsString("Введите корректный email."))
                    string(containsString("Не менее 10 символов"))
                }
            }
    }

    @Test
    fun `an email in use is reported in Russian`() {
        val email = "taken-${UUID.randomUUID()}@example.com"
        mockMvc.post("/register") {
            with(csrf())
            param("email", email)
            param("password", "1234567!Qq")
        }.andExpect { status { is3xxRedirection() } }

        mockMvc.post("/register") {
            cookie(Cookie("uliss_lang", "ru"))
            with(csrf())
            param("email", email)
            param("password", "1234567!Qq")
        }
            .andExpect { content { string(containsString("Этот email уже занят.")) } }
    }
}
