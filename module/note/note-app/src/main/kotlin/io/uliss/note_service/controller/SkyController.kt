package io.uliss.note_service.controller

import io.uliss.note_service.dto.response.SkyResponse
import io.uliss.note_service.dto.response.toResponse
import io.uliss.note_service.service.SkyService
import io.uliss.security.utils.getUserId
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/sky")
class SkyController(private val skyService: SkyService) {

    /** Everything the sky draws in one response, so the tree and the notes come from the same moment. */
    @GetMapping
    fun getSky(@AuthenticationPrincipal jwt: Jwt): SkyResponse = skyService.getSky(jwt.getUserId()).toResponse()
}
