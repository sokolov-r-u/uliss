package io.uliss.user_service.controller

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/users")
class ProfileController {

    @GetMapping("/me")
    fun getProfile(): ResponseEntity<String> {
        return ResponseEntity.ok("Hello World")
    }
}