package io.uliss.user_service.controller

import io.uliss.security.config.CorsProperties
import io.uliss.security.config.SecurityConfig
import io.uliss.user_service.anyValue
import io.uliss.user_service.dto.OnboardingMessageView
import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.eqValue
import io.uliss.user_service.service.MessageService
import io.uliss.user_service.service.UserProfileService
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID

// SecurityConfig/CorsProperties imported explicitly: @WebMvcTest does not auto-load third-party
// AutoConfiguration.imports entries, only beans it discovers itself.
@WebMvcTest(ProfileController::class)
@Import(SecurityConfig::class, CorsProperties::class)
class ProfileControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockitoBean
    lateinit var messageService: MessageService

    @MockitoBean
    lateinit var userProfileService: UserProfileService

    // Required for SecurityConfig's oauth2ResourceServer{jwt{}} to build; requests authenticate via
    // the jwt() request post-processor instead, so decode() is never actually invoked.
    @MockitoBean
    lateinit var jwtDecoder: JwtDecoder

    @Test
    fun `getProfile requires authentication`() {
        mockMvc.get("/user/users/me").andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `getProfile returns hello world for authenticated user`() {
        mockMvc.get("/user/users/me") {
            with(jwt())
        }.andExpect {
            status { isOk() }
            content { string("Hello World") }
        }
    }

    @Test
    fun `getOnboardingMessages delegates to messageService with jwt userId`() {
        val userId = UUID.randomUUID()
        val view = object : OnboardingMessageView {
            override val code = "SET_DISPLAY_NAME"
            override val blocking = true
            override val status = "PENDING"
        }
        Mockito.`when`(messageService.getPending(userId)).thenReturn(listOf(view))

        mockMvc.get("/user/users/me/onboarding") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].code") { value("SET_DISPLAY_NAME") }
        }
    }

    @Test
    fun `submitOnboarding happy path returns 204 and delegates to userProfileService`() {
        val userId = UUID.randomUUID()

        mockMvc.post("/user/users/me/onboarding") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"command":"SET_DISPLAY_NAME","displayName":"John","birthDate":null,"gender":null}"""
        }.andExpect {
            status { isNoContent() }
        }

        Mockito.verify(userProfileService).submit(eqValue<UUID>(userId), anyValue<OnboardingRequest>())
    }

    @Test
    fun `submitOnboarding rejects body failing validation with 400`() {
        mockMvc.post("/user/users/me/onboarding") {
            with(jwt())
            contentType = MediaType.APPLICATION_JSON
            content =
                """{"command":"SET_DISPLAY_NAME","displayName":"${"x".repeat(64)}","birthDate":null,"gender":null}"""
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `submitOnboarding requires authentication`() {
        mockMvc.post("/user/users/me/onboarding") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"command":"SET_DISPLAY_NAME","displayName":"John","birthDate":null,"gender":null}"""
        }.andExpect {
            status { isUnauthorized() }
        }
    }
}
