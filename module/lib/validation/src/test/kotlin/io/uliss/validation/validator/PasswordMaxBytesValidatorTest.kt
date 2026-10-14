package io.uliss.validation.validator

import io.uliss.validation.annotation.Password
import io.uliss.validation.util.MAX_PASSWORD_BYTES
import jakarta.validation.Validation
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PasswordMaxBytesValidatorTest {

    private val validator = PasswordMaxBytesValidator()

    @Test
    fun `null is left to other constraints`() {
        assertTrue(validator.isValid(null, null))
    }

    @Test
    fun `password at the BCrypt byte limit is valid`() {
        assertTrue(validator.isValid("a".repeat(MAX_PASSWORD_BYTES), null))
    }

    @Test
    fun `password one byte over the limit is invalid`() {
        assertFalse(validator.isValid("a".repeat(MAX_PASSWORD_BYTES + 1), null))
    }

    @Test
    fun `limit counts UTF-8 bytes, not characters`() {
        // 37 Cyrillic letters are 74 bytes although only 37 characters
        assertFalse(validator.isValid("я".repeat(37), null))
    }

    @Test
    fun `Password annotation rejects a password that matches the pattern but exceeds the byte limit`() {
        class Form(@field:Password val password: String)

        val beanValidator = Validation.buildDefaultValidatorFactory().use { it.validator }
        val tooLong = "Aa1!" + "я".repeat(40)

        assertEquals(1, beanValidator.validate(Form(tooLong)).size)
        assertTrue(beanValidator.validate(Form("1234567!Qq")).isEmpty())
    }
}
