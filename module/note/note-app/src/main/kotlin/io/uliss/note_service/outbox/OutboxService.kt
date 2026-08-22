package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.logging.logger.AppLogger
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.math.min
import kotlin.math.pow

private const val MAX_ATTEMPTS = 5
private val BASE_BACKOFF: Duration = Duration.ofSeconds(30)
private val MAX_BACKOFF: Duration = Duration.ofMinutes(30)
private val CLAIMABLE_STATUSES = listOf(OutboxEventStatus.PENDING, OutboxEventStatus.PROCESSING)

@Service
class OutboxService(
    private val outboxEventRepository: OutboxEventRepository,
    handlers: List<OutboxHandler>,
    @Value($$"${note.outbox.processing-timeout-ms}") private val processingTimeoutMs: Long,
) {
    private val log = AppLogger.of(OutboxService::class)
    private val handlers = handlers.associateBy { it.type }

    /**
     * Participates in the caller's transaction (e.g. alongside saving the note itself) - that's
     * the point of the outbox pattern: the event is only visible if the caller's write commits.
     */
    @Transactional
    fun publish(type: OutboxEventType, payload: String) {
        outboxEventRepository.save(
            OutboxEventEntity(
                type = type,
                payload = payload,
                status = OutboxEventStatus.PENDING,
                attempts = 0,
                nextAttemptAt = Instant.now(),
                lastError = null,
            )
        )
    }

    /**
     * Own short transaction, claims events for processing.
     *
     *
     * **Locking** - flips PENDING/expired-PROCESSING -> PROCESSING under FOR UPDATE SKIP LOCKED,
     * so concurrent pollers (multi-instance) never claim the same row.
     *
     * **Visibility timeout** - [nextAttemptAt] doubles as a visibility deadline while PROCESSING -
     * if the worker crashes before [process] saves a terminal status, the event becomes claimable
     * again once the deadline passes instead of being stuck in PROCESSING forever.
     */
    @Transactional
    fun claim(batchSize: Int): List<OutboxEventEntity> {
        val claimable = outboxEventRepository.findClaimable(
            CLAIMABLE_STATUSES,
            Instant.now(),
            PageRequest.of(0, batchSize),
        )
        val deadline = Instant.now().plusMillis(processingTimeoutMs)
        claimable.forEach {
            it.status = OutboxEventStatus.PROCESSING
            it.nextAttemptAt = deadline
        }
        return outboxEventRepository.saveAll(claimable).toList()
    }

    /**
     * Processes a single claimed event in its own transaction - a failure here must not roll back
     * sibling events already committed in the same poll batch, so the poller calls this once per
     * claimed event.
     *
     *
     * **A missing handler** ([NoOutboxHandlerException]) is a programming/deployment bug, not a
     * retryable business failure - deliberately left uncaught here, propagating straight to the
     * caller instead of going through [applyFailure].
     */
    @Transactional
    fun process(event: OutboxEventEntity) {
        val handler = handlers[event.type] ?: throw NoOutboxHandlerException(event.type)
        try {
            handler.handle(event)
            event.status = OutboxEventStatus.COMPLETED
        } catch (ex: Exception) {
            applyFailure(event, ex, "process")
        }
        outboxEventRepository.save(event)
    }

    /**
     * Compensating path for when [process]'s own transaction fails to commit for a reason other
     * than the handler itself - e.g. the final `save()` in [process] threw (an optimistic-lock
     * conflict, a transient DB error, etc.), which rolls back the whole transaction, including any
     * in-memory attempts/backoff already computed.
     *
     *
     * **Reload, don't reuse** - runs in its own fresh transaction, reloading the event so it
     * reflects the last actually-committed state rather than the stale in-memory instance from the
     * rolled-back attempt.
     */
    @Transactional
    fun recordFailure(eventId: UUID, ex: Exception) {
        val event = outboxEventRepository.findById(eventId).orElse(null)
        if (event == null) {
            log.error("cannot record failure - outbox event no longer exists", "recordFailure", ex)
            return
        }
        applyFailure(event, ex, "recordFailure")
        outboxEventRepository.save(event)
    }

    private fun applyFailure(event: OutboxEventEntity, ex: Exception, method: String) {
        event.attempts += 1
        event.lastError = ex.message
        event.status = if (event.attempts >= MAX_ATTEMPTS) OutboxEventStatus.FAILED else OutboxEventStatus.PENDING
        event.nextAttemptAt = Instant.now().plus(backoff(event.attempts))
        log.error(
            "failed to process outbox event id=${event.id} type=${event.type} attempts=${event.attempts}",
            method,
            ex,
        )
    }

    private fun backoff(attempts: Int): Duration {
        val seconds = min(BASE_BACKOFF.seconds * 2.0.pow(attempts - 1), MAX_BACKOFF.seconds.toDouble())
        return Duration.ofSeconds(seconds.toLong())
    }
}
