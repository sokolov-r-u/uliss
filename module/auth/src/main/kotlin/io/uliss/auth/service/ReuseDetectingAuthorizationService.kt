package io.uliss.auth.service

import io.uliss.auth.exception.ConcurrentRefreshException
import io.uliss.logging.logger.AppLogger
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType
import java.security.MessageDigest
import java.sql.Timestamp
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.HexFormat

/**
 * Refresh-token reuse detection (OAuth 2.0 Security BCP): every rotated-out refresh token is remembered by hash. When
 * one is presented again, a copy of the token is in someone else's hands, and the whole authorization is removed, so
 * neither the thief nor the user can refresh any more.
 *
 * A refresh repeated within [RETRY_GRACE] of the rotation is the client retrying an answer it never received, so it
 * gets the authorization and a new pair instead.
 */
class ReuseDetectingAuthorizationService(
    private val delegate: OAuth2AuthorizationService,
    private val jdbcTemplate: JdbcTemplate,
    private val clock: Clock,
    private val transactionTemplate: TransactionTemplate,
) : OAuth2AuthorizationService by delegate {

    private val log = AppLogger.of(ReuseDetectingAuthorizationService::class)

    /**
     * Saves under a row lock. An authorization loaded by refresh token carries the token stored at load time; when
     * another request rotated it meanwhile, this one saves nothing, so its token never replaces the one already handed
     * out (compare-and-set).
     */
    override fun save(authorization: OAuth2Authorization) {
        val expected = authorization.getAttribute<String>(EXPECTED_REFRESH_TOKEN)
        val toSave = if (expected == null) authorization
        else OAuth2Authorization.from(authorization).attributes { it.remove(EXPECTED_REFRESH_TOKEN) }.build()
        transactionTemplate.executeWithoutResult {
            // the stored token only: loading the whole authorization would deserialize its attributes on every save
            val previous = jdbcTemplate.queryForList(STORED_REFRESH_TOKEN, String::class.java, toSave.id).firstOrNull()
            if (expected != null && previous != expected) {
                log.info("authorization {} was rotated by a concurrent refresh, not saving", "save", toSave.id)
                throw ConcurrentRefreshException()
            }
            delegate.save(toSave)
            if (previous != null && previous != toSave.refreshToken?.token?.tokenValue) {
                jdbcTemplate.update(REMEMBER_ROTATED, hash(previous), toSave.id, Timestamp.from(clock.instant()))
            }
        }
    }

    override fun findByToken(token: String, tokenType: OAuth2TokenType?): OAuth2Authorization? {
        val found = delegate.findByToken(token, tokenType)
        if (found != null) return if (tokenType == OAuth2TokenType.REFRESH_TOKEN) found.forRefresh() else found
        if (tokenType != null && tokenType != OAuth2TokenType.REFRESH_TOKEN) return null

        val rotated = jdbcTemplate.query(FIND_ROTATED, { rs, _ ->
            RotatedToken(
                rs.getString("authorization_id"), rs.getTimestamp("rotated_at").toInstant(), rs.getBoolean("latest"),
            )
        }, hash(token)).firstOrNull() ?: return null
        // only the token the last rotation replaced: one retry per rotation, never a chain of old tokens
        if (tokenType == OAuth2TokenType.REFRESH_TOKEN && rotated.latest && rotated.within(RETRY_GRACE)) {
            log.info("refresh token rotated {} ago presented again, treating it as a retry of authorization {}",
                "findByToken", Duration.between(rotated.at, clock.instant()), rotated.authorizationId)
            return delegate.findById(rotated.authorizationId)?.forRefresh()
        }
        log.warn("rotated refresh token reused, revoking authorization {}", "findByToken", rotated.authorizationId)
        delegate.findById(rotated.authorizationId)?.let(delegate::remove)
        return null
    }

    /** Remembers the refresh token stored now, which [save] expects to replace. */
    private fun OAuth2Authorization.forRefresh(): OAuth2Authorization {
        val stored = refreshToken?.token?.tokenValue ?: return this
        return OAuth2Authorization.from(this).attribute(EXPECTED_REFRESH_TOKEN, stored).build()
    }

    private fun RotatedToken.within(grace: Duration): Boolean = !clock.instant().isAfter(at.plus(grace))

    private fun hash(token: String): String =
        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.toByteArray()))

    private class RotatedToken(val authorizationId: String, val at: Instant, val latest: Boolean)

    companion object {
        /** How long a just-rotated refresh token still serves a client that did not receive the new pair. */
        val RETRY_GRACE: Duration = Duration.ofSeconds(30)

        /** In-memory only: [save] removes it before the authorization is stored. */
        private const val EXPECTED_REFRESH_TOKEN = "io.uliss.auth.expected-refresh-token"
        private const val REMEMBER_ROTATED =
            "insert into rotated_refresh_token (token_hash, authorization_id, rotated_at) values (?, ?, ?) " +
                "on conflict do nothing"
        private const val FIND_ROTATED =
            "select r.authorization_id, r.rotated_at, r.rotated_at = (select max(l.rotated_at) " +
                "from rotated_refresh_token l where l.authorization_id = r.authorization_id) as latest " +
                "from rotated_refresh_token r where r.token_hash = ?"
        private const val STORED_REFRESH_TOKEN =
            "select refresh_token_value from oauth2_authorization where id = ? for update"
    }
}
