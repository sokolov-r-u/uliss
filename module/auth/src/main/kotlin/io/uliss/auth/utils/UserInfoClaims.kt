package io.uliss.auth.utils

import io.uliss.api.user.v1.UserInfoResponse
import org.springframework.security.oauth2.jwt.JwtClaimsSet

/** Profile claims of a user access token; `onboardingRequired` is present only while it is true (see `:security`). */
fun JwtClaimsSet.Builder.addUserInfo(info: UserInfoResponse) {
    claim("userId", info.userId)
    if (info.hasDisplayName()) {
        claim("displayName", info.displayName)
    }
    if (info.onboardingRequired) {
        claim("onboardingRequired", true)
    }
}
