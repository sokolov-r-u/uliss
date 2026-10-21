package io.uliss.auth.repository

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

/** Which browser session (OIDC `sid`) each authorization belongs to; rows go with their authorization. */
@Repository
class AuthorizationSessionRepository(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun save(authorizationId: String, sessionId: String) {
        jdbcTemplate.update(
            "INSERT INTO authorization_session (authorization_id, session_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
            authorizationId,
            sessionId,
        )
    }

    fun findAuthorizationIds(sessionId: String): List<String> = jdbcTemplate.queryForList(
        "SELECT authorization_id FROM authorization_session WHERE session_id = ?",
        String::class.java,
        sessionId,
    ).filterNotNull()
}
