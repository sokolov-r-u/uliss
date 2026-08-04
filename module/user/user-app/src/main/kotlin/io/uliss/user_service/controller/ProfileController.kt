package io.uliss.user_service.controller

import io.uliss.user_service.dto.OnboardingMessageView
import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.service.MessageService
import io.uliss.user_service.service.UserProfileService
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/users")
class ProfileController(
    private val userProfileService: UserProfileService,
    private val messageService: MessageService,
) {

    @GetMapping("/me")
    fun getProfile(): String {
        return "Hello World"
    }

    @GetMapping("/me/onboarding")
    fun getOnboardingMessages(@AuthenticationPrincipal jwt: Jwt): List<OnboardingMessageView> =
        messageService.getPending(currentUserId(jwt))

    @PostMapping("/me/onboarding")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun submitOnboarding(@AuthenticationPrincipal jwt: Jwt, @RequestBody request: OnboardingRequest) =
        userProfileService.submit(currentUserId(jwt), request)

    private fun currentUserId(jwt: Jwt): UUID = UUID.fromString(jwt.getClaimAsString("userId"))
}
