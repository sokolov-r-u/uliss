package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

class ChatReplyNotRetryableException(chatId: UUID, messageId: UUID) : ServerException(
    message = "reply id=$messageId of chat id=$chatId is not the chat's latest failed or interrupted reply",
    httpStatus = HttpStatus.CONFLICT,
    code = "CHAT_REPLY_NOT_RETRYABLE",
)
