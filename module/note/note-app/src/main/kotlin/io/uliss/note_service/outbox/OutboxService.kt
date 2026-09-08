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
    @Value($$"${note.outbox.processing-timeout-ms}") private val processingTimeoutMs: Long,
) {
    private val log = AppLogger.of(OutboxService::class)

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
     * if the worker crashes before [complete] saves a terminal status, the event becomes claimable
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

    @Transactional
    fun complete(eventId: UUID) {
        val event = outboxEventRepository.findById(eventId).orElse(null)
        if (event == null) {
            log.error("cannot complete missing outbox event id=$eventId", "complete")
            return
        }
        if (event.status != OutboxEventStatus.PROCESSING) {
            log.error("cannot complete outbox event id=$eventId with status=${event.status}", "complete")
            return
        }
        event.status = OutboxEventStatus.COMPLETED
        outboxEventRepository.save(event)
    }

    /**
     * Handles a failure from external work or completion in a fresh, short transaction. The
     * processor deliberately invokes it after the handler has returned, so no provider or vector
     * store call holds a database connection.
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
