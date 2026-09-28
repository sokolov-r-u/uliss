package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.service.type.AssistantReplyStream
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class ChatFacade(
    private val chatService: ChatService,
    private val assistantService: AssistantService,
    private val noteService: NoteService,
) {

    fun createChat(userId: UUID, title: String?): ChatEntity = chatService.createChat(userId, title)

    fun getChats(userId: UUID): List<ChatEntity> = chatService.getChats(userId)

    fun getMessages(userId: UUID, chatId: UUID): List<ChatMessageEntity> =
        chatService.getMessages(userId, chatId)

    fun streamMessage(userId: UUID, chatId: UUID, idempotencyKey: UUID, prompt: String): AssistantReplyStream =
        assistantService.streamReply(userId, chatId, idempotencyKey, prompt)

    fun cancelTurn(userId: UUID, chatId: UUID, turnId: UUID) {
        assistantService.cancelTurn(userId, chatId, turnId)
    }

    @Transactional
    fun requestSummary(userId: UUID, chatId: UUID, idempotencyKey: UUID): NoteEntity {
        val history = chatService.getMessages(userId, chatId)
        val throughMessageId = history.lastOrNull()?.id
            ?: throw BadRequestException("chat id=$chatId has no messages to summarize")
        return noteService.requestChatSummary(userId, chatId, throughMessageId, idempotencyKey)
    }
}
