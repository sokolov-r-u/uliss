package dto

import io.uliss.validation.annotation.Email
import io.uliss.validation.annotation.Password
import jakarta.validation.constraints.Size

data class RegisterUserRequest(
    @Email
    val email: String,
    @Password
    val password: String,
    @Size(min = 2, max = 38)
    val displayName: String
)
