package io.uliss.note_service.controller

import io.uliss.note_service.dto.AskRequest
import io.uliss.note_service.dto.AskResponse
import io.uliss.note_service.service.AskService
import io.uliss.security.utils.getUserId
import jakarta.validation.Valid
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class AskController(
    private val askService: AskService,
) {

    @PostMapping("/ask")
    fun ask(
        @AuthenticationPrincipal jwt: Jwt,
        @Valid @RequestBody request: AskRequest,
    ): AskResponse = AskResponse(askService.ask(jwt.getUserId(), request.prompt))
}
