package io.uliss.note_service.service

import io.uliss.database.entity.generateId
import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.dto.internal.ChatMessageCursorPage
import io.uliss.note_service.dto.internal.ChatSummaryContext
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.util.TitleNormalizer
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
@Transactional(readOnly = true)
class ChatService(
    private val chatRepository: ChatRepository,
    private val chatMessageRepository: ChatMessageRepository,
) {

    @Transactional(propagation = Propagation.MANDATORY)
    fun createChat(userId: UUID, idempotencyKey: UUID, content: String): ChatEntity {
        chatRepository.insertChatOnConflictDoNothing(
            id = generateId(),
            userId = userId,
            idempotencyKey = idempotencyKey,
            title = TitleNormalizer.normalizeChatTitle(content),
        )
        return chatRepository.findByUserIdAndIdempotencyKey(userId, idempotencyKey)
            ?: error("initial chat could not be loaded after insert")
    }

    fun getChats(userId: UUID): List<ChatEntity> =
        chatRepository.findByUserIdOrderByCreatedAtDesc(userId)

    @Transactional
    fun renameChat(userId: UUID, chatId: UUID, rawTitle: String): ChatEntity {
        val title = TitleNormalizer.normalizeUserTitle(rawTitle)
            ?: throw BadRequestException(TitleNormalizer.USER_TITLE_RULE)
        val chat = requireOwnedChat(userId, chatId)
        chat.title = title
        return chatRepository.save(chat)
    }

    /**
     * FK cascades remove the chat's turns, messages, summary requests and note links; linked notes
     * survive. Runs inside the caller's transaction, which must already hold the chat row lock.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    fun deleteChat(userId: UUID, chatId: UUID) {
        chatRepository.delete(requireOwnedChat(userId, chatId))
    }

    fun getMessages(userId: UUID, chatId: UUID, before: UUID?, limit: Int): ChatMessageCursorPage {
        requireOwnedChat(userId, chatId)
        val pageable = PageRequest.of(0, limit + 1)
        val descendingMessages = if (before == null) {
            chatMessageRepository.findLatestPage(chatId, pageable)
        } else {
            chatMessageRepository.findPageBefore(chatId, before, pageable)
        }
        val hasMore = descendingMessages.size > limit
        val retainedMessages = descendingMessages.take(limit)
        return ChatMessageCursorPage(
            messages = retainedMessages.reversed(),
            nextCursor = retainedMessages.lastOrNull()?.id?.takeIf { hasMore },
            hasMore = hasMore,
        )
    }

    fun getLatestMessageId(userId: UUID, chatId: UUID): UUID? {
        requireOwnedChat(userId, chatId)
        return chatMessageRepository.findLatestMessageId(chatId)
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

    fun requireOwnedChat(userId: UUID, chatId: UUID): ChatEntity =
        chatRepository.findByIdAndUserId(chatId, userId)
            ?: throw NotFoundException("chat id=$chatId not found")
}
