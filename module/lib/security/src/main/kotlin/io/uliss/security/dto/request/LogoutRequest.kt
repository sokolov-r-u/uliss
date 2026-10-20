package io.uliss.security.dto.request

/** [idToken] is the end-session hint; a client signed in before `openid` was requested has none. */
data class LogoutRequest(val refreshToken: String, val idToken: String? = null) {
    override fun toString(): String = "LogoutRequest()"
}
