package io.uliss.auth.service

import io.uliss.logging.logger.AppLogger
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType
import java.security.MessageDigest
import java.time.Clock
import java.util.HexFormat

/**
 * Refresh-token reuse detection (OAuth 2.0 Security BCP): every rotated-out refresh token is remembered by hash. When
 * one is presented again, a copy of the token is in someone else's hands, and the whole authorization is removed, so
 * neither the thief nor the user can refresh any more.
 */
class ReuseDetectingAuthorizationService(
    private val delegate: OAuth2AuthorizationService,
    private val jdbcTemplate: JdbcTemplate,
    private val clock: Clock,
) : OAuth2AuthorizationService by delegate {

    private val log = AppLogger.of(ReuseDetectingAuthorizationService::class)

    override fun save(authorization: OAuth2Authorization) {
        // the stored token only: loading the whole authorization would deserialize its attributes on every save
        val previous = jdbcTemplate.queryForList(STORED_REFRESH_TOKEN, String::class.java, authorization.id).firstOrNull()
        delegate.save(authorization)
        if (previous != null && previous != authorization.refreshToken?.token?.tokenValue) {
            jdbcTemplate.update(REMEMBER_ROTATED, hash(previous), authorization.id)
        }
    }

    override fun findByToken(token: String, tokenType: OAuth2TokenType?): OAuth2Authorization? {
        val start = clock.millis()
        val found = delegate.findByToken(token, tokenType)
        log.debug("findByToken") { "find by ${tokenType?.value} found=${found != null} took ${clock.millis() - start} ms" }
        if (found != null || (tokenType != null && tokenType != OAuth2TokenType.REFRESH_TOKEN)) return found

        val reusedFrom = jdbcTemplate.queryForList(FIND_ROTATED, String::class.java, hash(token)).firstOrNull()
            ?: return null
        log.warn("rotated refresh token reused, revoking authorization {}", "findByToken", reusedFrom)
        delegate.findById(reusedFrom)?.let(delegate::remove)
        return null
    }

    private fun hash(token: String): String =
        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.toByteArray()))

    private companion object {
        const val REMEMBER_ROTATED =
            "insert into rotated_refresh_token (token_hash, authorization_id) values (?, ?) on conflict do nothing"
        const val FIND_ROTATED = "select authorization_id from rotated_refresh_token where token_hash = ?"
        const val STORED_REFRESH_TOKEN = "select refresh_token_value from oauth2_authorization where id = ?"
    }
}
