package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

class SummaryInProgressException(chatId: UUID) : ServerException(
    message = "chat id=$chatId already has a summary in progress",
    httpStatus = HttpStatus.CONFLICT,
    code = "SUMMARY_IN_PROGRESS",
)
