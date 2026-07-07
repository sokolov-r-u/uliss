package utils

import jakarta.servlet.http.Cookie
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64


fun generateCodeVerifier(): String {
    val bytes = ByteArray(32)
    SecureRandom().nextBytes(bytes)
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

fun generateCodeChallenge(verifier: String): String {
    val bytes = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray())
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

fun setCookie(name: String, value: String, secureCookie: Boolean, maxAge: Int) {
    val response = (RequestContextHolder.getRequestAttributes() as ServletRequestAttributes).response!!
    response.addCookie(Cookie(name, value).apply {
        isHttpOnly = true
        secure = secureCookie
        path = "/"
        this.maxAge = maxAge
    })
}