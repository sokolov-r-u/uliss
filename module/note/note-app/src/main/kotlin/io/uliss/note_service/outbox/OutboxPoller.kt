package io.uliss.note_service.outbox

import io.uliss.logging.logger.AppLogger
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.core.task.TaskExecutor
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.Semaphore

@Component
class OutboxPoller(
    private val outboxService: OutboxService,
    private val outboxEventProcessor: OutboxEventProcessor,
    @Qualifier("applicationTaskExecutor") private val taskExecutor: TaskExecutor,
    outboxProperties: OutboxProperties,
) {
    private val log = AppLogger.of(OutboxPoller::class)
    private val permits = Semaphore(outboxProperties.concurrency)

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
        val reservedSlots = permits.drainPermits()
        if (reservedSlots == 0) return

        val claimed = try {
            outboxService.claim(reservedSlots)
        } catch (ex: Exception) {
            permits.release(reservedSlots)
            throw ex
        }
        permits.release(reservedSlots - claimed.size)
        claimed.forEach { event ->
            submit(event)
        }
    }

    private fun submit(event: OutboxEventEntity) {
        try {
            taskExecutor.execute {
                try {
                    outboxEventProcessor.process(event)
                } catch (ex: NoOutboxHandlerException) {
                    log.error("outbox event id=${event.id} has no registered handler", "poll", ex)
                } catch (ex: Exception) {
                    log.error("failed to process outbox event id=${event.id}", "poll", ex)
                } finally {
                    permits.release()
                }
            }
        } catch (ex: Exception) {
            permits.release()
            log.error("failed to submit outbox event id=${event.id}", "poll", ex)
        }
    }
}
