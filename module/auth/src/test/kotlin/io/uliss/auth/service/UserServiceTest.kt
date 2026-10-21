package io.uliss.auth.service

import io.uliss.auth.config.TestContainersConfiguration
import io.uliss.auth.dto.RegisterUserRequest
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import io.uliss.auth.exception.EmailAlreadyExistsException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.security.core.userdetails.UsernameNotFoundException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class UserServiceTest @Autowired constructor(
    private val userService: UserService,
    private val jdbcTemplate: JdbcTemplate,
) {

    @BeforeEach
    fun setUp() {
        jdbcTemplate.update("delete from auth.users")
    }

    @Test
    fun `finds user by email regardless of case`() {
        userService.register(RegisterUserRequest(email = "User@Example.com", password = "Passw0rd!"))
        val expected = userService.loadUserByUsername("user@example.com").username

        assertEquals(expected, userService.loadUserByUsername("USER@example.COM").username)
    }

    @Test
    fun `a second registration with the same email is a duplicate`() {
        userService.register(RegisterUserRequest(email = "same@example.com", password = "Passw0rd!"))

        assertFailsWith<EmailAlreadyExistsException> {
            userService.register(RegisterUserRequest(email = "SAME@example.com", password = "Passw0rd!"))
        }
    }

    @Test
    fun `a database error other than a duplicate email is not reported as a duplicate`() {
        // longer than the column: a data error, not a taken email
        val tooLong = "a".repeat(250) + "@example.com"

        val ex = assertFailsWith<DataIntegrityViolationException> {
            userService.register(RegisterUserRequest(email = tooLong, password = "Passw0rd!"))
        }
        assertFalse(ex is EmailAlreadyExistsException)
    }

    @Test
    fun `rejects unknown email`() {
        assertFailsWith<UsernameNotFoundException> { userService.loadUserByUsername("nobody@example.com") }
    }
}
