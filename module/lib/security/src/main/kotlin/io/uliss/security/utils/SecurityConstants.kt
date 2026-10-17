package io.uliss.security.utils

const val CODE_VERIFIER = "code_verifier"
const val OAUTH_STATE = "oauth_state"
// login cookies outlive a login form left open: the auth-server session (30 min) bounds the login anyway
const val MAX_COOKIE_AGE = 1800
