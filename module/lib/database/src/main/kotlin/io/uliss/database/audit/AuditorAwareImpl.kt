package io.uliss.database.audit

import org.springframework.data.domain.AuditorAware
import java.util.Optional

/** Auditor recorded when no user performed the write; :security's JWT-aware provider uses it too. */
const val SYSTEM_AUDITOR = "SYSTEM"

/**
 * Fallback for modules without :security (e.g. auth). Never empty, so created_by/updated_by
 * stay NOT NULL-safe even when no JWT-aware provider is on the classpath.
 */
class AuditorAwareImpl : AuditorAware<String> {
    override fun getCurrentAuditor(): Optional<String> = Optional.of(SYSTEM_AUDITOR)
}