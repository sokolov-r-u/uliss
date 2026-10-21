package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus

/** Every open status stream polls the database each second; one user cannot hold the pool with hundreds of them. */
class TooManyStatusStreamsException(limit: Int) : ServerException(
    message = "at most $limit note status streams may be open at once",
    httpStatus = HttpStatus.TOO_MANY_REQUESTS,
    code = TOO_MANY_STATUS_STREAMS,
)

const val TOO_MANY_STATUS_STREAMS = "TOO_MANY_STATUS_STREAMS"
