package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus

class ConstellationNameTakenException(name: String, cause: Throwable? = null) : ServerException(
    message = "constellation name '$name' is taken at this place",
    cause = cause,
    httpStatus = HttpStatus.CONFLICT,
    code = "CONSTELLATION_NAME_TAKEN",
)
