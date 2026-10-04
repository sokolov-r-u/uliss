package io.uliss.note_service.service.facade

import io.uliss.exception.common.BadRequestException
import io.uliss.note_service.dto.internal.ChatMessageCursorPage
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.service.AssistantService
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteService
import io.uliss.note_service.service.output.AssistantReplyStream
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class ChatFacade(
    private val chatService: ChatService,
    private val assistantService: AssistantService,
    private val noteService: NoteService,
) {

    fun getChats(userId: UUID): List<ChatEntity> = chatService.getChats(userId)

    fun getMessages(userId: UUID, chatId: UUID, before: UUID?, limit: Int): ChatMessageCursorPage =
        chatService.getMessages(userId, chatId, before, limit)

    @Transactional
    fun streamReply(
        userId: UUID,
        chatId: UUID?,
        idempotencyKey: UUID,
        prompt: String,
    ): AssistantReplyStream {
        val chat = if (chatId == null) {
            chatService.createChat(userId, idempotencyKey, prompt)
        } else {
            chatService.requireOwnedChat(userId, chatId)
        }
        return assistantService.streamReply(userId, chat.id, idempotencyKey, prompt)
    }

    fun cancelTurn(userId: UUID, chatId: UUID, turnId: UUID) {
        assistantService.cancelTurn(userId, chatId, turnId)
    }

    @Transactional
    fun requestSummary(userId: UUID, chatId: UUID, idempotencyKey: UUID): NoteEntity {
        val throughMessageId = chatService.getLatestMessageId(userId, chatId)
            ?: throw BadRequestException("chat id=$chatId has no messages to summarize")
        return noteService.requestChatSummary(userId, chatId, throughMessageId, idempotencyKey)
    }
}
