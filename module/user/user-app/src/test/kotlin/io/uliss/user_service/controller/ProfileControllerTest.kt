package io.uliss.user_service.controller

import io.uliss.security.config.CorsProperties
import io.uliss.security.config.OnboardingGuardConfig
import io.uliss.security.config.SecurityConfig
import io.uliss.security.config.WebMvcPathPrefixConfig
import io.uliss.exception.handler.GlobalExceptionHandler
import io.uliss.user_service.anyValue
import io.uliss.user_service.dto.OnboardingMessageView
import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.eqValue
import io.uliss.user_service.exception.OnboardingStepNotPendingException
import io.uliss.user_service.model.Gender
import io.uliss.user_service.model.OnboardingMessageCode
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
import java.time.LocalDate
import java.util.UUID

// SecurityConfig/CorsProperties imported explicitly: @WebMvcTest does not auto-load third-party
// AutoConfiguration.imports entries, only beans it discovers itself.
@WebMvcTest(ProfileController::class)
@Import(
    SecurityConfig::class,
    CorsProperties::class,
    WebMvcPathPrefixConfig::class,
    OnboardingGuardConfig::class,
    GlobalExceptionHandler::class,
)
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
    fun `profile root is not exposed`() {
        mockMvc.get("/user/users/me") {
            with(jwt())
        }.andExpect {
            status { isNotFound() }
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
    fun `onboarding endpoints stay available while blocking onboarding is pending`() {
        val onboarding = jwt().jwt { it.claim("userId", UUID.randomUUID().toString()).claim("onboardingRequired", true) }

        mockMvc.get("/user/users/me/onboarding") { with(onboarding) }.andExpect { status { isOk() } }
        mockMvc.post("/user/users/me/onboarding") {
            with(onboarding)
            contentType = MediaType.APPLICATION_JSON
            content = """{"command":"SET_DISPLAY_NAME","displayName":"John","birthDate":null,"gender":null}"""
        }.andExpect { status { isNoContent() } }
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

        Mockito.verify(userProfileService).submit(
            eqValue<UUID>(userId),
            eqValue<OnboardingRequest>(OnboardingRequest(OnboardingMessageCode.SET_DISPLAY_NAME, "John", null, null)),
        )
    }

    @Test
    fun `submitOnboarding maps the profile fields`() {
        mockMvc.post("/user/users/me/onboarding") {
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"command":"COMPLETE_PROFILE","birthDate":"1990-05-17","gender":"FEMALE"}"""
        }.andExpect { status { isNoContent() } }

        Mockito.verify(userProfileService).submit(
            anyValue(),
            eqValue<OnboardingRequest>(
                OnboardingRequest(OnboardingMessageCode.COMPLETE_PROFILE, null, LocalDate.of(1990, 5, 17), Gender.FEMALE)
            ),
        )
    }

    @Test
    fun `a step that is not pending answers 409 with its code`() {
        val userId = UUID.randomUUID()
        Mockito.doThrow(OnboardingStepNotPendingException(OnboardingMessageCode.SET_DISPLAY_NAME))
            .`when`(userProfileService).submit(eqValue<UUID>(userId), anyValue())

        mockMvc.post("/user/users/me/onboarding") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"command":"SET_DISPLAY_NAME","displayName":"John"}"""
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("ONBOARDING_STEP_NOT_PENDING") }
        }
    }

    @Test
    fun `an unknown command is a bad request in the json error format`() {
        mockMvc.post("/user/users/me/onboarding") {
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"command":"DELETE_EVERYTHING"}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("BAD_REQUEST_ERROR") }
        }
        Mockito.verifyNoInteractions(userProfileService)
    }

    @Test
    fun `an underage birth date is a validation error`() {
        mockMvc.post("/user/users/me/onboarding") {
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"command":"COMPLETE_PROFILE","birthDate":"${LocalDate.now().minusYears(10)}"}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("VALIDATION_ERROR") }
            jsonPath("$.details.birthDate") { value("You must be at least 16 years old.") }
        }
        Mockito.verifyNoInteractions(userProfileService)
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
            jsonPath("$.code") { value("VALIDATION_ERROR") }
            jsonPath("$.details.displayName") { exists() }
        }
        Mockito.verifyNoInteractions(userProfileService)
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
