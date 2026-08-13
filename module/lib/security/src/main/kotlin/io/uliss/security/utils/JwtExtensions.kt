package io.uliss.security.utils

import org.springframework.security.oauth2.jwt.Jwt
import java.util.UUID

const val USER_ID_CLAIM = "userId"

fun Jwt.getUserId(): UUID = UUID.fromString(getClaimAsString(USER_ID_CLAIM))
