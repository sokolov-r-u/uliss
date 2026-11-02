package io.uliss.note_service.controller

import io.uliss.note_service.dto.response.UserProfileResponse
import io.uliss.note_service.dto.response.toResponse
import io.uliss.note_service.service.UserProfileService
import io.uliss.security.utils.getUserId
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/profile")
class UserProfileController(private val userProfileService: UserProfileService) {

    /** What the model knows about the caller, read-only. */
    @GetMapping
    fun getProfile(@AuthenticationPrincipal jwt: Jwt): UserProfileResponse =
        userProfileService.findProfile(jwt.getUserId()).toResponse()
}
