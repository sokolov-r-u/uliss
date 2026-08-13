package io.uliss.note_service.controller

import io.uliss.note_service.service.AskService
import io.uliss.security.config.CorsProperties
import io.uliss.security.config.SecurityConfig
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.util.UUID

// SecurityConfig/CorsProperties imported explicitly: @WebMvcTest does not auto-load third-party
// AutoConfiguration.imports entries (io.uliss.security.SecurityAutoConfiguration), only beans it
// discovers itself (SecurityFilterChain is one of the types its TypeExcludeFilter lets through).
@WebMvcTest(AskController::class)
@Import(SecurityConfig::class, CorsProperties::class, AskService::class)
class AskControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockitoBean
    lateinit var chatClient: ChatClient

    // Required for SecurityConfig's oauth2ResourceServer{jwt{}} to build; requests authenticate via
    // the jwt() request post-processor instead, so decode() is never actually invoked.
    @MockitoBean
    lateinit var jwtDecoder: JwtDecoder

    @Test
    fun `unauthenticated request is rejected with 401`() {
        mockMvc.post("/ask") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"prompt":"hello"}"""
        }.andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `blank prompt is rejected with 400`() {
        mockMvc.post("/ask") {
            with(jwt())
            contentType = MediaType.APPLICATION_JSON
            content = """{"prompt":""}"""
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `valid prompt is answered and mapped to AskResponse`() {
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user("What is 6*7?")).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.content()).thenReturn("42")

        mockMvc.post("/ask") {
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"prompt":"What is 6*7?"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.answer") { value("42") }
        }
    }
}
