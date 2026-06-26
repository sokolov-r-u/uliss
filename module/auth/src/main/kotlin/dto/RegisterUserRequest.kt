package dto

import io.uliss.validation.annotation.Email
import io.uliss.validation.annotation.Password

data class RegisterUserRequest(
    @Email
    val email: String,
    @Password
    val password: String
)
