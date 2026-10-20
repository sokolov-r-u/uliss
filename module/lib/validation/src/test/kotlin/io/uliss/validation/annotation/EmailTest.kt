package io.uliss.validation.annotation

import jakarta.validation.Validation
import org.junit.jupiter.api.Test
import kotlin.test.assertTrue

class EmailTest {

    private class Registration(@field:Email val email: String)

    private val validator = Validation.buildDefaultValidatorFactory().validator

    private fun isValid(email: String) = validator.validate(Registration(email)).isEmpty()

    @Test
    fun `common addresses are accepted`() {
        listOf("alice@example.com", "alice+notes@example.com", "o'brien@example.ie", "a.b-c_d@mail.example.co")
            .forEach { assertTrue(isValid(it), it) }
    }

    @Test
    fun `malformed addresses are rejected`() {
        listOf("alice", "alice@", "@example.com", "a..b@example.com", ".a@example.com", "a@example", "a b@example.com")
            .forEach { assertTrue(!isValid(it), it) }
    }

    @Test
    fun `an address longer than the database column is rejected`() {
        // 64-char local part + a long domain: 255 characters in total, the column holds 254
        val email = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(58) + ".com"
        assertTrue(email.length == 255)
        assertTrue(!isValid(email))
    }
}
