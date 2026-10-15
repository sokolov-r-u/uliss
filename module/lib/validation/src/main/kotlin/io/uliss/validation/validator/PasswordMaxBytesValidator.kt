package io.uliss.validation.validator

import io.uliss.validation.annotation.Password
import io.uliss.validation.util.MAX_PASSWORD_BYTES
import jakarta.validation.ConstraintValidator
import jakarta.validation.ConstraintValidatorContext

/** BCrypt rejects passwords over 72 UTF-8 bytes; null is left to the other constraints. */
class PasswordMaxBytesValidator : ConstraintValidator<Password, String> {

    override fun isValid(value: String?, context: ConstraintValidatorContext?): Boolean =
        value == null || value.toByteArray(Charsets.UTF_8).size <= MAX_PASSWORD_BYTES
}
