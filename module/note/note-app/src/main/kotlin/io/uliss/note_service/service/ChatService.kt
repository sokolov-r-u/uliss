package io.uliss.note_service.service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

private const val DEFAULT_CHAT_TITLE = "New chat"

internal data class ChatSummaryContext(
    val title: String,
    val messages: List<ChatMessageEntity>,
)

@Service
@Transactional(readOnly = true)
class ChatService(
    private val chatRepository: ChatRepository,
    private val chatMessageRepository: ChatMessageRepository,
) {

    @Transactional
    fun createChat(userId: UUID, title: String?): ChatEntity =
        chatRepository.save(ChatEntity(userId, title?.takeIf { it.isNotBlank() } ?: DEFAULT_CHAT_TITLE))

    fun getChats(userId: UUID): List<ChatEntity> =
        chatRepository.findByUserIdOrderByCreatedAtDesc(userId)

    fun getMessages(userId: UUID, chatId: UUID): List<ChatMessageEntity> {
        requireOwnedChat(userId, chatId)
        return chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chatId)
    }

    internal fun getSummaryContext(userId: UUID, chatId: UUID, throughMessageId: UUID): ChatSummaryContext {
        val chat = requireOwnedChat(userId, chatId)
        val history = chatMessageRepository.findThroughMessage(chatId, throughMessageId)
        check(history.lastOrNull()?.id == throughMessageId) {
            "summary boundary message id=$throughMessageId not found in chat id=$chatId"
        }
        return ChatSummaryContext(chat.title, history)
    }

    /**
     * Persists the user's message and returns the ordered history including it, ready to send to
     * the AI provider.
     */
    @Transactional
    fun appendUserMessage(userId: UUID, chatId: UUID, prompt: String): List<ChatMessageEntity> {
        requireOwnedChat(userId, chatId)
        val priorHistory = chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chatId)
        val userMessage = chatMessageRepository.save(
            ChatMessageEntity(chatId, ChatMessageRole.USER, prompt, ChatMessageStatus.COMPLETE)
        )
        return priorHistory + userMessage
    }

    @Transactional
    fun persistAssistantReply(chatId: UUID, content: String, status: ChatMessageStatus): ChatMessageEntity =
        chatMessageRepository.save(ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, content, status))

    private fun requireOwnedChat(userId: UUID, chatId: UUID): ChatEntity =
        chatRepository.findByIdAndUserId(chatId, userId)
            ?: throw NotFoundException("chat id=$chatId not found")
}
