package io.uliss.auth.interceptor

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.servlet.HandlerInterceptor

/** Form pages carry a CSRF token and must not come back from a browser cache. */
class NoStoreInterceptor : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        response.setHeader("Cache-Control", "no-store")
        return true
    }
}
