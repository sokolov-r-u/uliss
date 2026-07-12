package io.uliss.auth.controller

import io.uliss.auth.config.TestContainersConfiguration
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

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class AuthControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun login() {
        mockMvc.get("/login")
            .andExpect {
                status { isOk() }
                content {
                    contentType("text/html;charset=UTF-8")
                    view { name("login") }
                }
            }
    }

    @Test
    fun registerPage() {
        mockMvc.get("/register")
            .andExpect {
                status { isOk() }
                content { contentType("text/html;charset=UTF-8") }
                view { name("register") }
            }
    }

    @Test
    fun `successful register redirects to login`() {
        mockMvc.post("/register") {
            param("email", "test${System.currentTimeMillis()}@gmail.com")
            param("password", "1234567!Qq")
            with(csrf())
        }
            .andExpect {
                status { is3xxRedirection() }
                redirectedUrl("/login?registered")
            }
    }


    @Test
    fun `register without csrf token is forbidden`() {
        mockMvc.post("/register")
            .andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `register with invalid email and password returns to register form`() {
        mockMvc.post("/register") {
            with(csrf())
            param("email", "invalid_email")
            param("password", "invalid_password")
        }
            .andExpect {
                status { isOk() }
                content { contentType("text/html;charset=UTF-8") }
                model {
                    attributeHasFieldErrors("registerForm", "email", "password")

                }
                view { name("register") }
            }
    }

    @Test
    fun `login with bad credentials redirects to login error`() {
        mockMvc.post("/login") {
            param("username", "nobody@gmail.com")
            param("password", "wrong-password")
            with(csrf())
        }
            .andExpect {
                status { is3xxRedirection() }
                redirectedUrl("/login?error")
            }
    }

    @Test
    fun `register with duplicate email stays on register page`() {
        mockMvc.post("/register") {
            param("email", "duplicate@gmail.com")
            param("password", "1234567!Qq")
            with(csrf())
        }

        mockMvc.post("/register") {
            param("email", "duplicate@gmail.com")
            param("password", "1234567!Qq")
            with(csrf())
        }
            .andExpect {
                status { isOk() }
                view { name("register") }
                model { attributeHasFieldErrors("registerForm", "email") }
            }
    }
}