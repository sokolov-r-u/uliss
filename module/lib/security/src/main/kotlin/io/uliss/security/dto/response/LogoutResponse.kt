package io.uliss.security.dto.response

import com.fasterxml.jackson.annotation.JsonInclude

/** Where the browser goes to end its auth-server session; absent when there is no id token to hint with. */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class LogoutResponse(val redirectUrl: String?) {
    override fun toString(): String = "LogoutResponse(redirect=${redirectUrl != null})"
}
