package io.uliss.auth.filter

import io.uliss.logging.logger.AppLogger
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.filter.OncePerRequestFilter
import java.time.Clock

/**
 * Logs how long each token endpoint request took, from its arrival before client authentication to the response, so a
 * slow refresh shows whether the time was spent in auth or before the request reached it. Logs no secrets.
 */
class TokenRequestTimingFilter(
    private val clock: Clock,
) : OncePerRequestFilter() {

    private val log = AppLogger.of(TokenRequestTimingFilter::class)

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain) {
        val start = clock.millis()
        try {
            filterChain.doFilter(request, response)
        } finally {
            log.info(
                "token request grant_type={} status={} took {} ms", "doFilterInternal",
                request.getParameter(GRANT_TYPE), response.status, clock.millis() - start,
            )
        }
    }

    private companion object {
        const val GRANT_TYPE = "grant_type"
    }
}
