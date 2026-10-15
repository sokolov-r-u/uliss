package io.uliss.auth.service

import io.uliss.logging.logger.AppLogger
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service

/**
 * Removes authorizations that can no longer be used: every issued code and token has expired.
 * Rows without any expiry (no token issued yet) are kept. Concurrent runs on several replicas are harmless.
 */
@Service
class AuthorizationCleanupService(
    private val jdbcTemplate: JdbcTemplate,
) {
    private val log = AppLogger.of(AuthorizationCleanupService::class)

    @Scheduled(cron = $$"${app.auth.authorization-cleanup.cron}")
    fun deleteExpired(): Int {
        val deleted = jdbcTemplate.update(DELETE_EXPIRED)
        log.info("deleted {} expired authorizations", "deleteExpired", deleted)
        return deleted
    }

    private companion object {
        // greatest() skips nulls and returns null only when no expiry is set
        const val DELETE_EXPIRED = """
            delete from oauth2_authorization
            where greatest(
                authorization_code_expires_at,
                access_token_expires_at,
                oidc_id_token_expires_at,
                refresh_token_expires_at,
                user_code_expires_at,
                device_code_expires_at
            ) < now()
        """
    }
}
