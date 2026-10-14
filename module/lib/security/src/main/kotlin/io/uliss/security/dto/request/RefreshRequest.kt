package io.uliss.security.dto.request

data class RefreshRequest(val refreshToken: String) {
    override fun toString(): String = "RefreshRequest()"
}
