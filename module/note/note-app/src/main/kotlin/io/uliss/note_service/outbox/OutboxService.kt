package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.exception.NonRetryableOutboxException
import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.policy.OutboxLeasePolicy
import io.uliss.note_service.repository.OutboxEventRepository
import org.springframework.context.annotation.Lazy
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ThreadLocalRandom

private val CLAIMABLE_STATUSES = listOf(OutboxEventStatus.PENDING, OutboxEventStatus.PROCESSING)

@Service
class OutboxService(
    private val outboxEventRepository: OutboxEventRepository,
    private val outboxLeasePolicy: OutboxLeasePolicy,
    private val outboxProperties: OutboxProperties,
    terminalFailureHandlers: List<OutboxTerminalFailureHandler>,
    // Lazy: handlers depend on services that publish through this one.
    @Lazy private val handlers: List<OutboxHandler>,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val log = AppLogger.of(OutboxService::class)
    private val terminalFailureHandlers = terminalFailureHandlers.associateBy { it.type }

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
                nextAttemptAt = clock.instant(),
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
     * if the worker crashes before [complete] saves a terminal status, the event becomes claimable
     * again once the deadline passes instead of being stuck in PROCESSING forever.
     *
     * **Attempts and lease** - every claim counts as an attempt (a crashed worker consumes one too)
     * and issues a fresh [OutboxEventEntity.leaseId]. An expired event that already used its last
     * attempt is failed here instead of being handed out again.
     *
     * **Handled types only** - an event type without a registered handler (e.g. an older instance
     * during a rolling deploy) is left for an instance that can process it, so it spends no attempts.
     */
    @Transactional
    fun claim(batchSize: Int): List<OutboxEventEntity> {
        val handledTypes = handlers.mapTo(mutableSetOf()) { it.type }
        if (handledTypes.isEmpty()) return emptyList()
        val now = clock.instant()
        val found = outboxEventRepository.findClaimable(
            CLAIMABLE_STATUSES,
            handledTypes,
            now,
            PageRequest.of(0, batchSize),
        )
        val (exhausted, claimable) = found.partition { it.attempts >= outboxProperties.maxAttempts }
        exhausted.forEach { failExhausted(it) }
        claimable.forEach {
            it.status = OutboxEventStatus.PROCESSING
            it.attempts += 1
            it.leaseId = UUID.randomUUID()
            it.nextAttemptAt = now.plus(outboxLeasePolicy.leaseFor(it.type))
        }
        outboxEventRepository.saveAll(found)
        return claimable
    }

    @Transactional
    fun complete(eventId: UUID, leaseId: UUID) {
        val event = findLeased(eventId, leaseId, "complete", null) ?: return
        event.status = OutboxEventStatus.COMPLETED
        event.leaseId = null
        outboxEventRepository.save(event)
    }

    /**
     * Handles a failure from external work or completion in a fresh, short transaction. The
     * processor deliberately invokes it after the handler has returned, so no provider or vector
     * store call holds a database connection. On the final attempt, the outbox state and any
     * registered domain failure transition commit or roll back together.
     */
    @Transactional
    fun recordFailure(eventId: UUID, leaseId: UUID, ex: Exception) {
        val event = findLeased(eventId, leaseId, "recordFailure", ex) ?: return
        applyFailure(event, ex)
        if (event.status == OutboxEventStatus.FAILED) {
            terminalFailureHandlers[event.type]?.handleTerminalFailure(event)
        }
        outboxEventRepository.save(event)
    }

    /**
     * Returns the event only while [leaseId] still owns it. A re-claim racing with this check is
     * caught by the entity's optimistic lock on commit.
     */
    private fun findLeased(eventId: UUID, leaseId: UUID, method: String, ex: Exception?): OutboxEventEntity? {
        val event = outboxEventRepository.findById(eventId).orElse(null)
        val reason = when {
            event == null -> "event no longer exists"
            event.status != OutboxEventStatus.PROCESSING -> "status=${event.status}"
            event.leaseId != leaseId -> "lease was taken over by a re-claim"
            else -> return event
        }
        val message = "ignoring $method for outbox event id=$eventId: $reason"
        if (ex == null) log.warn(message, method) else log.warn(message, method, ex)
        return null
    }

    private fun failExhausted(event: OutboxEventEntity) {
        event.status = OutboxEventStatus.FAILED
        event.leaseId = null
        event.lastError = "processing lease expired on the last attempt"
        log.error(
            "outbox event id=${event.id} type=${event.type} lease expired after attempts=${event.attempts}",
            "claim",
        )
        terminalFailureHandlers[event.type]?.handleTerminalFailure(event)
    }

    private fun applyFailure(event: OutboxEventEntity, ex: Exception) {
        event.lastError = ex.message
        event.leaseId = null
        event.status = if (ex is NonRetryableOutboxException || event.attempts >= outboxProperties.maxAttempts) {
            OutboxEventStatus.FAILED
        } else {
            OutboxEventStatus.PENDING
        }
        val delay = OutboxBackoff.delayAfter(event.attempts, ThreadLocalRandom.current().nextDouble())
        event.nextAttemptAt = clock.instant().plus(delay)
        log.error(
            "failed to process outbox event id=${event.id} type=${event.type} attempts=${event.attempts}",
            "recordFailure",
            ex,
        )
    }
}
