package utils

import jakarta.servlet.http.Cookie
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

const val CODE_VERIFIER = "code_verifier"

fun generateCodeVerifier(): String {
    val bytes = ByteArray(32)
    SecureRandom().nextBytes(bytes)
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

fun generateCodeChallenge(verifier: String): String {
    val bytes = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray())
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

fun getCodeVerifierCookie(verifier: String, secureCookie: Boolean): Cookie = Cookie(CODE_VERIFIER, verifier).apply {
    isHttpOnly = true
    secure = secureCookie
    path = "/"
    maxAge = 300
}
