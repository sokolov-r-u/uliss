package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

class ProfileRebuildRunningException(userId: UUID) : ServerException(
    message = "a profile rebuild of user=$userId is already running",
    httpStatus = HttpStatus.CONFLICT,
    code = "PROFILE_REBUILD_RUNNING",
)
