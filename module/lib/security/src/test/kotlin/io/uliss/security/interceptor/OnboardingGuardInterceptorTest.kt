package io.uliss.security.interceptor

import io.uliss.security.annotation.AllowedDuringOnboarding
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@SpringBootTest
@AutoConfigureMockMvc
@Import(
    OnboardingGuardInterceptorTest.GuardedController::class,
    OnboardingGuardInterceptorTest.OnboardingController::class,
)
class OnboardingGuardInterceptorTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    private val onboarding = jwt().jwt { it.claim("onboardingRequired", true) }

    @Test
    fun `user with blocking onboarding pending is refused`() {
        mockMvc.get("/guarded") { with(onboarding) }.andExpect {
            status { isForbidden() }
            jsonPath("$.code") { value("ONBOARDING_REQUIRED") }
        }
    }

    @Test
    fun `onboarded user passes`() {
        mockMvc.get("/guarded") { with(jwt()) }.andExpect { status { isOk() } }
    }

    @Test
    fun `explicit false claim passes`() {
        mockMvc.get("/guarded") { with(jwt().jwt { it.claim("onboardingRequired", false) }) }
            .andExpect { status { isOk() } }
    }

    @Test
    fun `handler allowed during onboarding passes`() {
        mockMvc.get("/guarded/allowed") { with(onboarding) }.andExpect { status { isOk() } }
    }

    @Test
    fun `controller allowed during onboarding passes`() {
        mockMvc.get("/onboarding") { with(onboarding) }.andExpect { status { isOk() } }
    }

    @Test
    fun `mediator login stays available during onboarding`() {
        mockMvc.get("/oauth2/login") { with(onboarding) }.andExpect { status { is3xxRedirection() } }
    }

    @RestController
    class GuardedController {
        @GetMapping("/guarded")
        fun guarded() = "ok"

        @AllowedDuringOnboarding
        @GetMapping("/guarded/allowed")
        fun allowed() = "ok"
    }

    @AllowedDuringOnboarding
    @RestController
    class OnboardingController {
        @GetMapping("/onboarding")
        fun onboarding() = "ok"
    }
}
