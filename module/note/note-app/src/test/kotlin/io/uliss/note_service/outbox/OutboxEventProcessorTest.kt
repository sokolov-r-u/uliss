package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.anyValue
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.time.Instant
import kotlin.test.assertFailsWith

class OutboxEventProcessorTest {

    private val outboxService = Mockito.mock(OutboxService::class.java)

    private fun event(type: OutboxEventType = OutboxEventType.NOTE_INDEX_REQUESTED) = OutboxEventEntity(
        type = type,
        payload = "{}",
        status = OutboxEventStatus.PROCESSING,
        attempts = 0,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )

    @Test
    fun `process invokes the handler outside outbox service completion and then completes`() {
        val handler = Mockito.mock(OutboxHandler::class.java)
        Mockito.`when`(handler.type).thenReturn(OutboxEventType.NOTE_INDEX_REQUESTED)
        val processor = OutboxEventProcessor(outboxService, listOf(handler))
        val event = event()

        processor.process(event)

        val order = Mockito.inOrder(handler, outboxService)
        order.verify(handler).handle(event)
        order.verify(outboxService).complete(event.id)
        Mockito.verify(outboxService, Mockito.never()).recordFailure(anyValue(), anyValue())
    }

    @Test
    fun `process records handler failure after external execution`() {
        val handler = Mockito.mock(OutboxHandler::class.java)
        Mockito.`when`(handler.type).thenReturn(OutboxEventType.NOTE_INDEX_REQUESTED)
        val failure = RuntimeException("provider unavailable")
        Mockito.`when`(handler.handle(anyValue())).thenThrow(failure)
        val processor = OutboxEventProcessor(outboxService, listOf(handler))
        val event = event()

        processor.process(event)

        Mockito.verify(outboxService).recordFailure(event.id, failure)
        Mockito.verify(outboxService, Mockito.never()).complete(anyValue())
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
