package io.uliss.note_service.service.facade

import io.uliss.exception.common.BadRequestException
import io.uliss.note_service.dto.internal.ChatMessageCursorPage
import io.uliss.note_service.dto.internal.ChatWithNoteCount
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.service.AssistantService
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.ChatTurnService
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
    private val chatTurnService: ChatTurnService,
) {

    fun getChats(userId: UUID): List<ChatWithNoteCount> {
        val chats = chatService.getChats(userId)
        val counts = noteService.getNoteCounts(chats.map { it.id })
        return chats.map { ChatWithNoteCount(it, counts[it.id] ?: 0) }
    }

    fun getChat(userId: UUID, chatId: UUID): ChatWithNoteCount =
        withNoteCount(chatService.requireOwnedChat(userId, chatId))

    fun renameChat(userId: UUID, chatId: UUID, title: String): ChatWithNoteCount =
        withNoteCount(chatService.renameChat(userId, chatId, title))

    /** The chat row lock is held from the live-turn check through the delete. */
    @Transactional
    fun deleteChat(userId: UUID, chatId: UUID) {
        chatTurnService.lockChatForDeletion(userId, chatId)
        chatService.deleteChat(userId, chatId)
    }

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

    private fun withNoteCount(chat: ChatEntity): ChatWithNoteCount =
        ChatWithNoteCount(chat, noteService.getNoteCounts(listOf(chat.id))[chat.id] ?: 0)
}
