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
import org.springframework.security.core.userdetails.UsernameNotFoundException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

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
    fun `rejects unknown email`() {
        assertFailsWith<UsernameNotFoundException> { userService.loadUserByUsername("nobody@example.com") }
    }
}
