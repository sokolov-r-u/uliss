package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.time.Instant

/** The user's rebuilds in the window are used up; [availableAt] is when the oldest of them leaves it. */
class ProfileRebuildLimitException(availableAt: Instant) : ServerException(
    message = "profile rebuild limit reached until $availableAt",
    httpStatus = HttpStatus.TOO_MANY_REQUESTS,
    code = "PROFILE_REBUILD_LIMIT",
    details = mapOf("availableAt" to availableAt.toString()),
)
