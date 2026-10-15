package io.uliss.security.dto.request

data class LogoutRequest(val refreshToken: String) {
    override fun toString(): String = "LogoutRequest()"
}
