package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

/** The chat's unsummarized tail is too long for another message; the user has to Summarize first. */
class ChatTailLimitException(chatId: UUID) : ServerException(
    message = "chat id=$chatId has too long an unsummarized tail for a new message",
    httpStatus = HttpStatus.CONFLICT,
    code = "CHAT_TAIL_LIMIT",
)
