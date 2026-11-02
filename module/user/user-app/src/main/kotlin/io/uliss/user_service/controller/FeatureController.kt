package io.uliss.user_service.controller

import io.uliss.security.annotation.AllowedDuringOnboarding
import io.uliss.security.utils.getUserId
import io.uliss.user_service.service.FeatureFlagService
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/users")
class FeatureController(private val featureFlagService: FeatureFlagService) {

    // the web client loads flags with the session, before onboarding is done
    @AllowedDuringOnboarding
    @GetMapping("/me/features")
    fun getFeatures(@AuthenticationPrincipal jwt: Jwt): Map<String, Boolean> =
        featureFlagService.getForUser(jwt.getUserId())
}
