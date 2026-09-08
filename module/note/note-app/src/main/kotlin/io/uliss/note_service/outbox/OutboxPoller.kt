package io.uliss.note_service.outbox

import io.uliss.logging.logger.AppLogger
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

private const val BATCH_SIZE = 20

@Component
class OutboxPoller(
    private val outboxService: OutboxService,
    private val outboxEventProcessor: OutboxEventProcessor,
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
     * Handler failures are recorded by [OutboxEventProcessor] in a separate transaction. An
     * exception reaching this class means that failure bookkeeping itself could not finish; the
     * visibility deadline then makes the event claimable again.
     */
    @Scheduled(fixedDelayString = $$"${note.outbox.poll-interval-ms}")
    fun poll() {
        val claimed = outboxService.claim(BATCH_SIZE)
        claimed.forEach { event ->
            try {
                outboxEventProcessor.process(event)
            } catch (ex: NoOutboxHandlerException) {
                log.error("outbox event id=${event.id} has no registered handler", "poll", ex)
            } catch (ex: Exception) {
                log.error("failed to process outbox event id=${event.id}", "poll", ex)
            }
        }
    }
}
