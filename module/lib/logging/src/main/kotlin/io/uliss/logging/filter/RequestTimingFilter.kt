package io.uliss.logging.filter

import io.uliss.logging.logger.AppLogger
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.filter.OncePerRequestFilter
import java.time.Clock

/**
 * Logs at INFO how long each request took, from its arrival at this filter to the response, with only the request
 * parameters in [safeParameters]; other parameters, the body and headers may hold secrets and are never logged.
 * Not auto-configured: a service registers it (`FilterRegistrationBean`) on the paths worth timing.
 */
class RequestTimingFilter(
    private val clock: Clock,
    private val safeParameters: Set<String>,
) : OncePerRequestFilter() {

    private val log = AppLogger.of(RequestTimingFilter::class)

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain) {
        val start = clock.millis()
        try {
            filterChain.doFilter(request, response)
        } finally {
            val parameters = safeParameters.mapNotNull { name -> request.getParameter(name)?.let { "$name=$it " } }
            log.info(
                "{} {} {}status={} took {} ms", "doFilterInternal",
                request.method, request.requestURI, parameters.joinToString(""), response.status, clock.millis() - start,
            )
        }
    }
}
