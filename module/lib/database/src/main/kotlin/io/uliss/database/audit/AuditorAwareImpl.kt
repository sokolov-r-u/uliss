package io.uliss.database.audit

import org.springframework.data.domain.AuditorAware
import java.util.Optional

class AuditorAwareImpl: AuditorAware<String> {
    override fun getCurrentAuditor(): Optional<String> {
        TODO("TBD after security")
    }
}