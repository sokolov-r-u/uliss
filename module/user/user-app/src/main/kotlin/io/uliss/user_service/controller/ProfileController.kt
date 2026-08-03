package io.uliss.user_service.controller

import dto.UserMessageDto
import io.uliss.user_service.service.MessageService
import io.uliss.user_service.service.UserService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/users")
class ProfileController(private val userService: UserService, private val messageService: MessageService) {

    @GetMapping("/me")
    fun getProfile(): String {
        return "Hello World"
    }

    @GetMapping("/me/onboarding")
    fun getOnboardingMessages(): List<UserMessageDto> {
        return listOf()

    }
}