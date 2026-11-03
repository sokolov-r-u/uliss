package io.uliss.note_service.controller

import io.uliss.note_service.dto.request.UpdateProfileAboutRequest
import io.uliss.note_service.dto.request.UpdateProfileRulesRequest
import io.uliss.note_service.dto.response.ProfileRebuildResponse
import io.uliss.note_service.dto.response.UserProfileResponse
import io.uliss.note_service.dto.response.toResponse
import io.uliss.note_service.service.UserProfileInputService
import io.uliss.note_service.service.UserProfileService
import jakarta.validation.Valid
import io.uliss.security.utils.getUserId
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/profile")
class UserProfileController(
    private val userProfileService: UserProfileService,
    private val userProfileInputService: UserProfileInputService,
) {

    /** What the model knows about the caller, read-only, with their rebuild state. */
    @GetMapping
    fun getProfile(@AuthenticationPrincipal jwt: Jwt): UserProfileResponse {
        return profileOf(jwt.getUserId())
    }

    /** Saves the caller's description of themselves; the profile itself is not rewritten for it. */
    @PutMapping("/about")
    fun saveAbout(
        @AuthenticationPrincipal jwt: Jwt,
        @Valid @RequestBody request: UpdateProfileAboutRequest,
    ): UserProfileResponse {
        val userId = jwt.getUserId()
        userProfileInputService.saveAbout(userId, request.about)
        return profileOf(userId)
    }

    /** Saves the caller's rules for their profile; changed rules are applied to the profile right away. */
    @PutMapping("/rules")
    fun saveRules(
        @AuthenticationPrincipal jwt: Jwt,
        @Valid @RequestBody request: UpdateProfileRulesRequest,
    ): UserProfileResponse {
        val userId = jwt.getUserId()
        userProfileInputService.saveRules(userId, request.rules)
        return profileOf(userId)
    }

    /** Rebuilds the caller's profile from all their notes; limited per window, see the rebuild state. */
    @PostMapping("/rebuild")
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun rebuild(@AuthenticationPrincipal jwt: Jwt): ProfileRebuildResponse =
        userProfileService.requestRebuild(jwt.getUserId()).toResponse()

    private fun profileOf(userId: UUID): UserProfileResponse =
        userProfileService.findProfile(userId).toResponse(
            userProfileService.getRebuildState(userId),
            userProfileInputService.getInput(userId),
            userProfileService.getRulesState(userId),
        )
}
