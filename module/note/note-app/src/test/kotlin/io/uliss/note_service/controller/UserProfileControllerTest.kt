package io.uliss.note_service.controller

import io.uliss.exception.handler.GlobalExceptionHandler
import io.uliss.note_service.service.UserProfileInputService
import io.uliss.note_service.service.UserProfileService
import io.uliss.security.config.CorsProperties
import io.uliss.security.config.OnboardingGuardConfig
import io.uliss.security.config.SecurityConfig
import io.uliss.security.config.WebMvcPathPrefixConfig
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
import org.springframework.test.web.servlet.put
import java.util.UUID

@WebMvcTest(UserProfileController::class)
@Import(
    SecurityConfig::class,
    CorsProperties::class,
    WebMvcPathPrefixConfig::class,
    OnboardingGuardConfig::class,
    GlobalExceptionHandler::class,
)
class UserProfileControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockitoBean
    lateinit var userProfileService: UserProfileService

    @MockitoBean
    lateinit var userProfileInputService: UserProfileInputService

    @MockitoBean
    lateinit var jwtDecoder: JwtDecoder

    @Test
    fun `a null rule is refused as a client error and nothing is saved`() {
        mockMvc.put("/note/profile/rules") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"rules":["keep it short",null]}"""
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) })
        }.andExpect {
            status { isBadRequest() }
            // the Kotlin module refuses a null element while reading the body, before validation
            jsonPath("$.code") { value("BAD_REQUEST_ERROR") }
        }
        Mockito.verifyNoInteractions(userProfileInputService)
    }
}
