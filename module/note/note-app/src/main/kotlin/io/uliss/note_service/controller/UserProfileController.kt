package io.uliss.note_service.controller

import io.uliss.note_service.dto.response.ProfileRebuildResponse
import io.uliss.note_service.dto.response.UserProfileResponse
import io.uliss.note_service.dto.response.toResponse
import io.uliss.note_service.service.UserProfileService
import io.uliss.security.utils.getUserId
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/profile")
class UserProfileController(private val userProfileService: UserProfileService) {

    /** What the model knows about the caller, read-only, with their rebuild state. */
    @GetMapping
    fun getProfile(@AuthenticationPrincipal jwt: Jwt): UserProfileResponse {
        val userId = jwt.getUserId()
        return userProfileService.findProfile(userId).toResponse(userProfileService.getRebuildState(userId))
    }

    /** Rebuilds the caller's profile from all their notes; limited per window, see the rebuild state. */
    @PostMapping("/rebuild")
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun rebuild(@AuthenticationPrincipal jwt: Jwt): ProfileRebuildResponse =
        userProfileService.requestRebuild(jwt.getUserId()).toResponse()
}
