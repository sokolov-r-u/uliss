package io.uliss.note_service.outbox

import org.springframework.stereotype.Component

/**
 * Executes external outbox handlers between the service's short claim and completion/failure
 * transactions. This class intentionally has no transactional annotation.
 */
@Component
class OutboxEventProcessor(
    private val outboxService: OutboxService,
    handlers: List<OutboxHandler>,
) {
    private val handlers = handlers.associateBy { it.type }

    fun process(event: OutboxEventEntity) {
        val handler = handlers[event.type] ?: throw NoOutboxHandlerException(event.type)
        try {
            handler.handle(event)
            outboxService.complete(event.id)
        } catch (ex: Exception) {
            outboxService.recordFailure(event.id, ex)
        }
    }
}
