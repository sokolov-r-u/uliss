package io.uliss.note_service.service

import io.uliss.database.utils.generateId
import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.dto.internal.ChatMessageCursorPage
import io.uliss.note_service.dto.internal.KeysetPage
import io.uliss.note_service.dto.internal.ListCursor
import io.uliss.note_service.dto.internal.ChatSummaryContext
import io.uliss.note_service.exception.PinLimitReachedException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatTitleSource
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.util.PinLimit
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

    /** A page of the user's chats by last activity, starting strictly after [cursor] (from the top when null). */
    fun getChats(userId: UUID, cursor: ListCursor?, limit: Int): KeysetPage<ChatEntity> {
        val rows = if (cursor == null) {
            chatRepository.findPage(userId, limit + 1)
        } else {
            chatRepository.findPageAfter(userId, cursor.updatedAt, cursor.id, limit + 1)
        }
        return KeysetPage.of(rows, limit) { ListCursor(checkNotNull(it.updatedAt), it.id) }
    }

    /** The user's chats among [chatIds], by last activity; ids of missing or foreign chats are skipped. */
    fun getChatsByIds(userId: UUID, chatIds: Collection<UUID>): List<ChatEntity> {
        if (chatIds.isEmpty()) return emptyList()
        return chatRepository.findByUserIdAndIdInOrderByUpdatedAtDescIdDesc(userId, chatIds)
    }

    /** Lifts the chat in chat lists; a rename does the same through the entity's last-modified date. */
    @Transactional(propagation = Propagation.MANDATORY)
    fun touchActivity(userId: UUID, chatId: UUID) {
        if (chatRepository.touchActivity(chatId, userId) == 0) {
            throw NotFoundException("chat id=$chatId not found")
        }
    }

    /**
     * Pins the owned chat on top of the pinned list; a pinned chat keeps its place. Fails with
     * [PinLimitReachedException] when [PinLimit.MAX] chats are pinned already.
     */
    @Transactional
    fun pinChat(userId: UUID, chatId: UUID): ChatEntity {
        chatRepository.lockPins(userId)
        if (chatRepository.pin(chatId, userId, PinLimit.MAX) == 0) {
            val chat = getOwnedChat(userId, chatId)
            if (chat.pinnedAt == null) throw PinLimitReachedException("chat")
            return chat
        }
        return getOwnedChat(userId, chatId)
    }

    @Transactional
    fun unpinChat(userId: UUID, chatId: UUID) {
        if (chatRepository.unpin(chatId, userId) == 0) throw NotFoundException("chat id=$chatId not found")
    }

    /** The user's pinned chats, last pinned first. */
    fun getPinnedChats(userId: UUID): List<ChatEntity> = chatRepository.findPinned(userId, PinLimit.MAX)

    @Transactional
    fun renameChat(userId: UUID, chatId: UUID, rawTitle: String): ChatEntity {
        val title = TitleNormalizer.normalizeUserTitle(rawTitle)
            ?: throw BadRequestException(TitleNormalizer.USER_TITLE_RULE)
        val chat = getOwnedChat(userId, chatId)
        chat.title = title
        chat.titleSource = ChatTitleSource.USER
        return chatRepository.save(chat)
    }

    /** Stores the model's [title] while the chat still has its first-message title; false when it did not apply. */
    @Transactional
    fun applyGeneratedTitle(userId: UUID, chatId: UUID, title: String): Boolean =
        chatRepository.applyGeneratedTitle(chatId, userId, title) == 1

    /**
     * FK cascades remove the chat's turns, messages, summary requests and note links; linked notes
     * survive. Runs inside the caller's transaction, which must already hold the chat row lock.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    fun deleteChat(userId: UUID, chatId: UUID) {
        chatRepository.delete(getOwnedChat(userId, chatId))
    }

    fun getMessages(userId: UUID, chatId: UUID, before: UUID?, limit: Int): ChatMessageCursorPage {
        getOwnedChat(userId, chatId)
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
        getOwnedChat(userId, chatId)
        return chatMessageRepository.findLatestMessageId(chatId)
    }

    internal fun getSummaryContext(userId: UUID, chatId: UUID, throughMessageId: UUID): ChatSummaryContext {
        val chat = getOwnedChat(userId, chatId)
        val history = chatMessageRepository.findThroughMessage(chatId, throughMessageId)
        check(history.lastOrNull()?.id == throughMessageId) {
            "summary boundary message id=$throughMessageId not found in chat id=$chatId"
        }
        return ChatSummaryContext(chat.title, history)
    }

    /** Messages in (afterMessageId, throughMessageId]; the whole chat through the boundary when afterMessageId is null. */
    internal fun getSummaryUpdateContext(
        userId: UUID,
        chatId: UUID,
        afterMessageId: UUID?,
        throughMessageId: UUID,
    ): ChatSummaryContext {
        if (afterMessageId == null) return getSummaryContext(userId, chatId, throughMessageId)
        val chat = getOwnedChat(userId, chatId)
        val messages = chatMessageRepository.findAfterThroughMessage(chatId, afterMessageId, throughMessageId)
        check(messages.lastOrNull()?.id == throughMessageId) {
            "summary boundary message id=$throughMessageId not found after id=$afterMessageId in chat id=$chatId"
        }
        return ChatSummaryContext(chat.title, messages)
    }

    fun getOwnedChat(userId: UUID, chatId: UUID): ChatEntity =
        chatRepository.findByIdAndUserId(chatId, userId)
            ?: throw NotFoundException("chat id=$chatId not found")
}
