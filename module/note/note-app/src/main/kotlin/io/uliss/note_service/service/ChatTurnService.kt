package io.uliss.note_service.service

import io.uliss.database.utils.generateId
import io.uliss.exception.common.InternalException
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.dto.internal.ChatTurnRequestResolution
import io.uliss.note_service.exception.ChatReplyNotRetryableException
import io.uliss.note_service.exception.ChatTurnAlreadyGeneratingException
import io.uliss.note_service.exception.IdempotencyKeyReusedException
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.projection.ChatTurn
import io.uliss.note_service.model.projection.ChatTurnStatus
import io.uliss.note_service.model.projection.RequestFingerprint
import io.uliss.note_service.policy.ChatTurnExecutionPolicy
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.ChatTurnStore
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.UUID

/**
 * Owns the persistent lifecycle of a chat turn.
 *
 * A turn is one user submission together with the assistant generation it starts. The backend
 * generates `chat_turn.id`, which links the user and assistant messages. The client sends a
 * separate key in the `Idempotency-Key` header to identify retries within one chat.
 *
 * This service keeps turn state and messages consistent. Reserving a turn and its user message is
 * one short transaction. The AI provider call happens outside that transaction. Finalization is a
 * second short transaction fenced by the generation attempt, so an expired or canceled attempt
 * cannot overwrite a newer result.
 */
@Service
class ChatTurnService(
    private val chatTurnStore: ChatTurnStore,
    private val chatMessageRepository: ChatMessageRepository,
    private val chatRepository: ChatRepository,
    private val executionPolicy: ChatTurnExecutionPolicy,
) {

    /**
     * Resolves a client-submitted turn into the action that [AssistantService] must take.
     *
     * The client-provided [idempotencyKey] is scoped to [chatId]. The request fingerprint binds that
     * key to the exact [content], so it cannot be reused for another message in the same chat. The
     * same key may be used independently in another chat.
     *
     * The owned chat row is locked for this transaction to serialize turn reservations within one
     * chat. The method then produces one of these outcomes:
     *
     * - a missing turn is created as `GENERATING` together with exactly one user message and is
     *   returned as [ChatTurnRequestResolution.StartGeneration];
     * - a matching turn with a live lease is returned as
     *   [ChatTurnRequestResolution.AlreadyGenerating] with its retry delay;
     * - a matching terminal turn is returned as [ChatTurnRequestResolution.AlreadyFinished]
     *   without creating another message or invoking the provider;
     * - a matching turn with an expired lease is either claimed as the next fenced generation
     *   attempt or changed to `FAILED` after reaching the configured attempt limit.
     *
     * A different active turn for the same chat is rejected. This method performs no provider
     * calls; the transaction commits before [AssistantService] starts or resumes generation.
     *
     * @throws NotFoundException when the chat does not exist or belongs to another user
     * @throws IdempotencyKeyReusedException when [idempotencyKey] is already bound to other content
     * @throws ChatTurnAlreadyGeneratingException when another turn is active for this chat
     * @throws InternalException when an expired turn cannot be safely reclaimed or reconstructed
     */
    @Transactional
    fun resolveTurnRequest(
        userId: UUID,
        chatId: UUID,
        idempotencyKey: UUID,
        content: String,
    ): ChatTurnRequestResolution {
        requireAndLockOwnedChat(userId, chatId)

        val requestFingerprint = calculateRequestFingerprint(content)
        findAndResolveExistingTurn(userId, chatId, idempotencyKey, requestFingerprint)?.let { return it }

        ensureNoOtherTurnIsGenerating(userId, chatId)
        return startNewTurn(userId, chatId, idempotencyKey, requestFingerprint, content)
    }

    /**
     * Resolves the user's retry of reply [messageId] of turn [turnId] under the owned chat's lock.
     *
     * - a `FAILED` or `PARTIAL` reply that is the chat's latest message is deleted and its turn restarts as the next
     *   fenced attempt ([ChatTurnRequestResolution.StartGeneration]); the user message stays as it is;
     * - a turn that is generating is resolved like a repeated send (pending, or a reclaim of an expired lease);
     * - a reply that is no longer the turn's reply (a repeated retry) replays the turn's outcome.
     *
     * @throws NotFoundException when the chat or the turn does not exist or belongs to someone else
     * @throws ChatReplyNotRetryableException when the reply is complete, stopped or not the latest message
     * @throws ChatTurnAlreadyGeneratingException when another turn of the chat is generating
     */
    @Transactional
    fun resolveRetryRequest(userId: UUID, chatId: UUID, turnId: UUID, messageId: UUID): ChatTurnRequestResolution {
        requireAndLockOwnedChat(userId, chatId)
        val turn = chatTurnStore.findById(userId, turnId)?.takeIf { it.chatId == chatId }
            ?: throw NotFoundException("chat turn id=$turnId not found")
        if (turn.status == ChatTurnStatus.GENERATING) return resolveGeneratingTurn(turn)

        val reply = chatMessageRepository.findByTurnIdAndRole(turnId, ChatMessageRole.ASSISTANT)
        if (reply?.id != messageId) return ChatTurnRequestResolution.AlreadyFinished(turn)
        if (reply.status !in RETRYABLE_REPLY_STATUSES || chatMessageRepository.findLatestMessageId(chatId) != reply.id) {
            throw ChatReplyNotRetryableException(chatId, messageId)
        }

        ensureNoOtherTurnIsGenerating(userId, chatId)
        val restarted = chatTurnStore.restartFinished(turnId, userId, chatId, executionPolicy.lease.toMillis())
            ?: throw InternalException("chat turn id=$turnId could not be restarted from ${turn.status}")
        chatMessageRepository.delete(reply)
        return ChatTurnRequestResolution.StartGeneration(restarted, loadProviderHistory(restarted))
    }

    /**
     * Locks the owned chat row for the caller's deletion transaction. A generating turn with a live
     * lease must be stopped first so it cannot write into a deleted chat; an expired lease does not block.
     *
     * @throws NotFoundException when the chat does not exist or belongs to another user
     * @throws ChatTurnAlreadyGeneratingException when a turn is generating under a live lease
     */
    @Transactional(propagation = Propagation.MANDATORY)
    fun lockChatForDeletion(userId: UUID, chatId: UUID) {
        requireAndLockOwnedChat(userId, chatId)
        chatTurnStore.findGenerating(userId, chatId)
            ?.takeIf { it.retryAfterMs > 0 }
            ?.let { throw ChatTurnAlreadyGeneratingException(chatId, it.id) }
    }

    private fun requireAndLockOwnedChat(userId: UUID, chatId: UUID) {
        if (!chatTurnStore.lockOwnedChat(userId, chatId)) {
            throw NotFoundException("chat id=$chatId not found")
        }
    }

    /**
     * Atomically moves the expected generation attempt to a terminal status and saves its
     * assistant message. Returns `false` when the attempt is stale or was already terminated.
     */
    @Transactional
    fun finishGenerationAttempt(
        userId: UUID,
        chatId: UUID,
        turnId: UUID,
        attempt: Int,
        content: String,
        status: ChatTurnStatus,
    ): Boolean {
        require(status in TERMINAL_GENERATION_STATUSES) {
            "generation must finish as COMPLETE, PARTIAL, or FAILED"
        }
        val transitioned = chatTurnStore.transitionToTerminal(turnId, userId, chatId, attempt, status)
        if (!transitioned) return false

        chatMessageRepository.save(
            ChatMessageEntity(
                chatId = chatId,
                role = ChatMessageRole.ASSISTANT,
                content = content,
                status = status.toMessageStatus(),
                turnId = turnId,
            )
        )
        return true
    }

    /**
     * Gives a generating [turn] a full lease again from now, for work that adds provider calls to one attempt
     * (a notes search before the next model call). Returns `false` when the attempt lost its fence.
     */
    fun extendLease(turn: ChatTurn): Boolean = chatTurnStore.extendLease(
        turnId = turn.id,
        userId = turn.userId,
        chatId = turn.chatId,
        attempt = turn.attempt,
        leaseMillis = executionPolicy.lease.toMillis(),
    )

    /**
     * Cancels a generating turn and persists its canceled assistant outcome.
     *
     * Repeating cancellation for an already terminal turn is safe and leaves its state unchanged.
     */
    @Transactional
    fun cancelTurn(userId: UUID, chatId: UUID, turnId: UUID): ChatTurn {
        if (!chatTurnStore.lockOwnedChat(userId, chatId)) {
            throw NotFoundException("chat id=$chatId not found")
        }
        val existing = chatTurnStore.findById(userId, turnId)
            ?: throw NotFoundException("chat turn id=$turnId not found")
        if (existing.chatId != chatId) {
            throw NotFoundException("chat turn id=$turnId not found")
        }
        if (existing.status != ChatTurnStatus.GENERATING) return existing

        if (chatTurnStore.cancelGenerating(turnId, userId, chatId)) {
            chatMessageRepository.save(
                ChatMessageEntity(
                    chatId = chatId,
                    role = ChatMessageRole.ASSISTANT,
                    content = "",
                    status = ChatMessageStatus.CANCELED,
                    turnId = turnId,
                )
            )
        }
        return loadTurn(userId, turnId, "chat turn disappeared after cancellation")
    }

    private fun findAndResolveExistingTurn(
        userId: UUID,
        chatId: UUID,
        idempotencyKey: UUID,
        requestFingerprint: RequestFingerprint,
    ): ChatTurnRequestResolution? {
        val existing = chatTurnStore.findByIdempotencyKey(userId, chatId, idempotencyKey) ?: return null
        validateSameRequest(existing, requestFingerprint)
        return resolveExistingTurn(existing)
    }

    /**
     * Another turn with a live lease blocks the chat. One whose lease expired has no worker left (e.g. a restart
     * mid-stream) and only its own key could resume it, which a client that lost the key never sends: it is failed
     * here, so the chat is not blocked forever.
     */
    private fun ensureNoOtherTurnIsGenerating(userId: UUID, chatId: UUID) {
        val active = chatTurnStore.findGenerating(userId, chatId) ?: return
        if (active.retryAfterMs > 0 || !chatTurnStore.failExpired(active.id, userId, chatId)) {
            throw ChatTurnAlreadyGeneratingException(chatId, active.id)
        }
        saveFailedAssistantMessage(active)
    }

    private fun startNewTurn(
        userId: UUID,
        chatId: UUID,
        idempotencyKey: UUID,
        requestFingerprint: RequestFingerprint,
        content: String,
    ): ChatTurnRequestResolution.StartGeneration {
        val priorHistory = chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chatId)
        val turn = reserveNewTurn(userId, chatId, idempotencyKey, requestFingerprint)
        val userMessage = saveUserMessage(chatId, turn.id, content)
        chatRepository.touchActivity(chatId, userId)
        return ChatTurnRequestResolution.StartGeneration(turn, priorHistory + userMessage)
    }

    private fun reserveNewTurn(
        userId: UUID,
        chatId: UUID,
        idempotencyKey: UUID,
        requestFingerprint: RequestFingerprint,
    ): ChatTurn {
        val turnId = generateId()
        val turn = chatTurnStore.insert(
            turnId = turnId,
            userId = userId,
            chatId = chatId,
            idempotencyKey = idempotencyKey,
            requestFingerprint = requestFingerprint,
            leaseMillis = executionPolicy.lease.toMillis(),
        ) ?: throw InternalException(
            "chat turn reservation for chat id=$chatId and its idempotency key could not be persisted"
        )
        return turn
    }

    private fun saveUserMessage(chatId: UUID, turnId: UUID, content: String): ChatMessageEntity =
        chatMessageRepository.save(
            ChatMessageEntity(
                chatId = chatId,
                role = ChatMessageRole.USER,
                content = content,
                status = ChatMessageStatus.COMPLETE,
                turnId = turnId,
            )
        )

    private fun resolveExistingTurn(existing: ChatTurn): ChatTurnRequestResolution = when (existing.status) {
        ChatTurnStatus.COMPLETE,
        ChatTurnStatus.PARTIAL,
        ChatTurnStatus.FAILED,
        ChatTurnStatus.CANCELED,
            -> ChatTurnRequestResolution.AlreadyFinished(existing)

        ChatTurnStatus.GENERATING -> resolveGeneratingTurn(existing)
    }

    private fun resolveGeneratingTurn(existing: ChatTurn): ChatTurnRequestResolution {
        if (existing.retryAfterMs > 0) return ChatTurnRequestResolution.AlreadyGenerating(existing)

        if (existing.attempt >= executionPolicy.maxAttempts) {
            if (chatTurnStore.failExpiredAtAttemptLimit(
                    existing.id,
                    existing.userId,
                    existing.chatId,
                    executionPolicy.maxAttempts,
                )
            ) {
                saveFailedAssistantMessage(existing)
            }
            return ChatTurnRequestResolution.AlreadyFinished(
                loadTurn(existing.userId, existing.id, "chat turn disappeared after reaching its attempt limit")
            )
        }

        val claimed = chatTurnStore.claimExpired(
            turnId = existing.id,
            userId = existing.userId,
            chatId = existing.chatId,
            expectedAttempt = existing.attempt,
            maxAttempts = executionPolicy.maxAttempts,
            leaseMillis = executionPolicy.lease.toMillis(),
        )
        if (claimed != null) {
            return ChatTurnRequestResolution.StartGeneration(claimed, loadProviderHistory(claimed))
        }

        val current = loadTurn(
            existing.userId,
            existing.id,
            "chat turn disappeared while reclaiming its expired attempt=${existing.attempt}",
        )
        if (current.status != ChatTurnStatus.GENERATING) {
            return ChatTurnRequestResolution.AlreadyFinished(current)
        }
        if (current.attempt != existing.attempt || current.retryAfterMs > 0) {
            return resolveExistingTurn(current)
        }
        throw InternalException(
            "chat turn id=${existing.id} remained expired after its attempt=${existing.attempt} reclaim was rejected"
        )
    }

    /** The terminal assistant outcome of a turn that failed before producing content. */
    private fun saveFailedAssistantMessage(turn: ChatTurn) {
        chatMessageRepository.save(
            ChatMessageEntity(
                chatId = turn.chatId,
                role = ChatMessageRole.ASSISTANT,
                content = "",
                status = ChatMessageStatus.FAILED,
                turnId = turn.id,
            )
        )
    }

    private fun loadProviderHistory(turn: ChatTurn): List<ChatMessageEntity> {
        val history = chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(turn.chatId)
        if (history.count { it.turnId == turn.id && it.role == ChatMessageRole.USER } != 1) {
            throw InternalException(
                "chat turn id=${turn.id} was reclaimed, but its single user message could not be loaded"
            )
        }
        return history
    }

    private fun validateSameRequest(existing: ChatTurn, requestFingerprint: RequestFingerprint) {
        if (existing.requestFingerprint != requestFingerprint) {
            throw IdempotencyKeyReusedException()
        }
    }

    /** Current state of an owned turn, e.g. after a generation attempt lost its fence. */
    @Transactional(readOnly = true)
    fun getTurn(userId: UUID, turnId: UUID): ChatTurn =
        chatTurnStore.findById(userId, turnId) ?: throw NotFoundException("chat turn id=$turnId not found")

    private fun loadTurn(userId: UUID, turnId: UUID, failure: String): ChatTurn =
        chatTurnStore.findById(userId, turnId) ?: throw InternalException(failure)

    private fun calculateRequestFingerprint(content: String): RequestFingerprint {
        val contentBytes = content.toByteArray(StandardCharsets.UTF_8)
        val canonicalRequest = ByteBuffer.allocate(
            Byte.SIZE_BYTES + Int.SIZE_BYTES + contentBytes.size
        )
            .put(REQUEST_FINGERPRINT_FORMAT_VERSION)
            .putInt(contentBytes.size)
            .put(contentBytes)
            .array()
        return RequestFingerprint.from(MessageDigest.getInstance("SHA-256").digest(canonicalRequest))
    }

    private fun ChatTurnStatus.toMessageStatus(): ChatMessageStatus = when (this) {
        ChatTurnStatus.COMPLETE -> ChatMessageStatus.COMPLETE
        ChatTurnStatus.PARTIAL -> ChatMessageStatus.PARTIAL
        ChatTurnStatus.FAILED -> ChatMessageStatus.FAILED
        ChatTurnStatus.CANCELED -> ChatMessageStatus.CANCELED
        ChatTurnStatus.GENERATING -> error("GENERATING is not a terminal message status")
    }

    private companion object {
        const val REQUEST_FINGERPRINT_FORMAT_VERSION: Byte = 1
        val RETRYABLE_REPLY_STATUSES = setOf(ChatMessageStatus.FAILED, ChatMessageStatus.PARTIAL)
        val TERMINAL_GENERATION_STATUSES = setOf(
            ChatTurnStatus.COMPLETE,
            ChatTurnStatus.PARTIAL,
            ChatTurnStatus.FAILED,
        )
    }
}
