package io.uliss.security.interceptor

import io.uliss.security.annotation.AllowedDuringOnboarding
import io.uliss.security.exception.OnboardingRequiredException
import io.uliss.security.utils.isOnboardingRequired
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.method.HandlerMethod
import org.springframework.web.servlet.HandlerInterceptor

/**
 * Refuses handlers not marked [AllowedDuringOnboarding] while the token says blocking onboarding is pending.
 * Thrown from `preHandle`, the exception reaches `GlobalExceptionHandler` and becomes `403 ONBOARDING_REQUIRED`.
 */
class OnboardingGuardInterceptor : HandlerInterceptor {

    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (handler !is HandlerMethod || isAllowed(handler)) return true
        val jwt = SecurityContextHolder.getContext().authentication?.principal as? Jwt ?: return true
        if (jwt.isOnboardingRequired()) throw OnboardingRequiredException()
        return true
    }

    private fun isAllowed(handler: HandlerMethod): Boolean =
        handler.hasMethodAnnotation(AllowedDuringOnboarding::class.java) ||
                handler.beanType.isAnnotationPresent(AllowedDuringOnboarding::class.java)
}
