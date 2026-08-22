package io.uliss.note_service.outbox

import io.uliss.logging.logger.AppLogger
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

private const val BATCH_SIZE = 20

@Component
class OutboxPoller(
    private val outboxService: OutboxService,
) {
    private val log = AppLogger.of(OutboxPoller::class)

    /**
     * Claims a batch and processes each event, isolating failures per event so one bad event
     * doesn't stop the rest of the batch.
     *
     *
     * **[NoOutboxHandlerException]** - a programming/deployment bug (no handler registered for the
     * type), not a retryable business failure. Just logged, doesn't count against attempts.
     *
     * **Any other exception** - [OutboxService.process]'s own transaction rolled back entirely
     * (e.g. its final `save()` threw), so attempts/backoff were never persisted.
     * [OutboxService.recordFailure] redoes that bookkeeping in a fresh, minimal transaction.
     *
     * **If [OutboxService.recordFailure] itself also fails** (e.g. the database is down) - the
     * event stays PROCESSING and self-heals once its visibility deadline passes (see
     * [OutboxService.claim]).
     */
    @Scheduled(fixedDelayString = $$"${note.outbox.poll-interval-ms}")
    fun poll() {
        val claimed = outboxService.claim(BATCH_SIZE)
        claimed.forEach { event ->
            try {
                outboxService.process(event)
            } catch (ex: NoOutboxHandlerException) {
                log.error("outbox event id=${event.id} has no registered handler", "poll", ex)
            } catch (ex: Exception) {
                try {
                    outboxService.recordFailure(event.id, ex)
                } catch (recordEx: Exception) {
                    log.error("failed to record outbox failure for id=${event.id}", "poll", recordEx)
                }
            }
        }
    }
}
