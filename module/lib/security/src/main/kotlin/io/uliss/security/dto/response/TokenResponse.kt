package io.uliss.security.dto.response

import com.fasterxml.jackson.annotation.JsonProperty
import java.time.Instant

data class TokenResponse(
    @JsonProperty("access_token") val accessToken: String,
    @JsonProperty("refresh_token") val refreshToken: String?,
    @JsonProperty("expires_in") val expiresIn: Long,
    @JsonProperty("token_type") val tokenType: String = "Bearer"
) {
    val expiresAt: Instant = Instant.now().plusSeconds(expiresIn)
}
