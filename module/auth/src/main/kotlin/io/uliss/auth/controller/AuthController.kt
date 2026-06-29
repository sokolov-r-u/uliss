package io.uliss.auth.controller

import dto.RegisterUserRequest
import io.uliss.auth.service.UserService
import jakarta.validation.Valid
import org.springframework.stereotype.Controller
import org.springframework.ui.Model
import org.springframework.validation.BindingResult
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.ModelAttribute
import org.springframework.web.bind.annotation.PostMapping

@Controller
class AuthController(
    private val userService: UserService
) {

    @GetMapping("/login")
    fun login(model: Model): String {
        model.addAttribute(FORM_ATTRIBUTE, RegisterUserRequest(email = "", password = ""))
        return "login"
    }

    @GetMapping("/register")
    fun registerPage(model: Model): String {
        model.addAttribute(FORM_ATTRIBUTE, RegisterUserRequest(email = "", password = ""))
        return "register"
    }

    @PostMapping("/register")
    fun register(
        @Valid @ModelAttribute(FORM_ATTRIBUTE) form: RegisterUserRequest,
        bindingResult: BindingResult
    ): String {
        if (bindingResult.hasErrors()) {
            return "register"
        }
        userService.register(form)
        return "redirect:/login?registered"
    }

    private companion object {
        const val FORM_ATTRIBUTE = "registerForm"
    }
}
