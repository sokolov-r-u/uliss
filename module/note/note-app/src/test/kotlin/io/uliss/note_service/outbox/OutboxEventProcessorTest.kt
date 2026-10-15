package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.anyValue
import io.uliss.note_service.exception.NoOutboxHandlerException
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.outbox.infra.OutboxEventProcessor
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.time.Instant
import java.util.UUID
import kotlin.test.assertFailsWith

class OutboxEventProcessorTest {

    private val outboxService = Mockito.mock(OutboxService::class.java)

    private val lease = UUID.randomUUID()

    private fun event(type: OutboxEventType = OutboxEventType.NOTE_INDEX_REQUESTED) = OutboxEventEntity(
        type = type,
        payload = "{}",
        status = OutboxEventStatus.PROCESSING,
        attempts = 1,
        nextAttemptAt = Instant.now(),
        lastError = null,
    ).also { it.leaseId = lease }

    @Test
    fun `process invokes the handler outside outbox service completion and then completes under its lease`() {
        val handler = Mockito.mock(OutboxHandler::class.java)
        Mockito.`when`(handler.type).thenReturn(OutboxEventType.NOTE_INDEX_REQUESTED)
        val processor = OutboxEventProcessor(outboxService, listOf(handler))
        val event = event()

        processor.process(event)

        val order = Mockito.inOrder(handler, outboxService)
        order.verify(handler).handle(event)
        order.verify(outboxService).complete(event.id, lease)
        Mockito.verify(outboxService, Mockito.never()).recordFailure(anyValue(), anyValue(), anyValue())
    }

    @Test
    fun `process records handler failure under its lease after external execution`() {
        val handler = Mockito.mock(OutboxHandler::class.java)
        Mockito.`when`(handler.type).thenReturn(OutboxEventType.NOTE_INDEX_REQUESTED)
        val failure = RuntimeException("provider unavailable")
        Mockito.`when`(handler.handle(anyValue())).thenThrow(failure)
        val processor = OutboxEventProcessor(outboxService, listOf(handler))
        val event = event()

        processor.process(event)

        Mockito.verify(outboxService).recordFailure(event.id, lease, failure)
        Mockito.verify(outboxService, Mockito.never()).complete(anyValue(), anyValue())
    }

    @Test
    fun `process propagates a missing handler without recording retryable failure`() {
        val processor = OutboxEventProcessor(outboxService, emptyList())

        assertFailsWith<NoOutboxHandlerException> {
            processor.process(event())
        }
        Mockito.verifyNoInteractions(outboxService)
    }
}
