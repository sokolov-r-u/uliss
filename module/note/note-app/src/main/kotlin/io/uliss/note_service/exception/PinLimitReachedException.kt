package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import io.uliss.note_service.util.PinLimit
import org.springframework.http.HttpStatus

/** The user already pinned [PinLimit.MAX] items of this kind; one has to be unpinned first. */
class PinLimitReachedException(kind: String) : ServerException(
    message = "$kind pin limit of ${PinLimit.MAX} reached",
    httpStatus = HttpStatus.CONFLICT,
    code = "PIN_LIMIT_REACHED",
)
