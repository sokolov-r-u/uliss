package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

class ChatTurnAlreadyGeneratingException(chatId: UUID, turnId: UUID) : ServerException(
    message = "chat id=$chatId already has active turn id=$turnId",
    httpStatus = HttpStatus.CONFLICT,
    code = "CHAT_TURN_ACTIVE",
)
