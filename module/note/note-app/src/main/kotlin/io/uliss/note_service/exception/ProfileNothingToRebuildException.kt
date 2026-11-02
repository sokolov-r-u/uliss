package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

/** No profile text and no READY note: a rebuild would read nothing and spend a try. */
class ProfileNothingToRebuildException(userId: UUID) : ServerException(
    message = "user=$userId has no profile and no notes to rebuild it from",
    httpStatus = HttpStatus.CONFLICT,
    code = "PROFILE_NOTHING_TO_REBUILD",
)
