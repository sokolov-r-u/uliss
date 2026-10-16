package io.uliss.auth.repository

import io.uliss.auth.config.TestContainersConfiguration
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.test.assertContains
import kotlin.test.assertFailsWith

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class UserEmailIndexTest @Autowired constructor(
    private val jdbcTemplate: JdbcTemplate,
    private val transactionTemplate: TransactionTemplate,
) {

    @BeforeEach
    fun setUp() {
        jdbcTemplate.update("delete from auth.users")
    }

    @Test
    fun `email lookup can use the unique index`() {
        insertUser("user@example.com")

        // An empty table always plans a seq scan; disabling it shows whether the index is usable at all.
        val plan = transactionTemplate.execute {
            jdbcTemplate.execute("set local enable_seqscan = off")
            jdbcTemplate.queryForList("explain select id from auth.users where email = ?", String::class.java, "user@example.com")
                .joinToString("\n")
        }

        assertContains(plan.orEmpty(), "Index Scan using users_email_unique")
    }

    @Test
    fun `rejects a duplicate email`() {
        insertUser("user@example.com")

        assertFailsWith<DuplicateKeyException> { insertUser("user@example.com") }
    }

    @Test
    fun `rejects an email that is not lower case`() {
        assertFailsWith<DataIntegrityViolationException> { insertUser("User@example.com") }
    }

    private fun insertUser(email: String) {
        val now = OffsetDateTime.now()
        jdbcTemplate.update(
            "insert into auth.users (id, email, password_hash, status, created_at, updated_at, version) " +
                    "values (?, ?, 'hash', 'ACTIVE', ?, ?, 0)",
            UUID.randomUUID(), email, now, now,
        )
    }
}
