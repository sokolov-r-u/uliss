package io.uliss.auth.repository

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

/** Registered clients that config no longer has; their rows would otherwise keep working with old secrets. */
@Repository
class RetiredClientRepository(
    private val jdbcTemplate: JdbcTemplate,
) {
    /** Deletes every client except [keepClientIds] with its authorizations and consents; returns the client count. */
    @Transactional
    fun deleteAllExcept(keepClientIds: Collection<String>): Int {
        require(keepClientIds.isNotEmpty()) { "refusing to delete every registered client" }
        val retired = "SELECT id FROM oauth2_registered_client WHERE client_id NOT IN (${placeholders(keepClientIds)})"
        val args = keepClientIds.toTypedArray()
        jdbcTemplate.update("DELETE FROM oauth2_authorization WHERE registered_client_id IN ($retired)", *args)
        jdbcTemplate.update("DELETE FROM oauth2_authorization_consent WHERE registered_client_id IN ($retired)", *args)
        return jdbcTemplate.update(
            "DELETE FROM oauth2_registered_client WHERE client_id NOT IN (${placeholders(keepClientIds)})",
            *args,
        )
    }

    private fun placeholders(values: Collection<String>) = values.joinToString { "?" }
}
