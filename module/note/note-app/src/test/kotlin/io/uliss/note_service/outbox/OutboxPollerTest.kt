package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.time.Instant

class OutboxPollerTest {

    private val outboxService = Mockito.mock(OutboxService::class.java)
    private val outboxEventProcessor = Mockito.mock(OutboxEventProcessor::class.java)
    private val poller = OutboxPoller(outboxService, outboxEventProcessor)

    private fun event() = OutboxEventEntity(
        type = OutboxEventType.NOTE_INDEX_REQUESTED,
        payload = """{"noteId":"n"}""",
        status = OutboxEventStatus.PROCESSING,
        attempts = 0,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )

    @Test
    fun `poll processes every event claimed in the batch`() {
        val first = event()
        val second = event()
        Mockito.`when`(outboxService.claim(20)).thenReturn(listOf(first, second))

        poller.poll()

        Mockito.verify(outboxEventProcessor).process(first)
        Mockito.verify(outboxEventProcessor).process(second)
    }

    @Test
    fun `poll keeps processing remaining events when one processor call throws`() {
        val first = event()
        val second = event()
        Mockito.`when`(outboxService.claim(20)).thenReturn(listOf(first, second))
        Mockito.`when`(outboxEventProcessor.process(first)).thenThrow(RuntimeException("boom"))

        poller.poll()

        Mockito.verify(outboxEventProcessor).process(first)
        Mockito.verify(outboxEventProcessor).process(second)
    }

    @Test
    fun `poll leaves failure bookkeeping to the processor`() {
        val first = event()
        Mockito.`when`(outboxService.claim(20)).thenReturn(listOf(first))

        poller.poll()

        Mockito.verify(outboxService).claim(20)
        Mockito.verify(outboxEventProcessor).process(first)
        Mockito.verifyNoMoreInteractions(outboxService)
    }

    @Test
    fun `poll does not record a compensating failure when process throws NoOutboxHandlerException`() {
        val first = event()
        Mockito.`when`(outboxService.claim(20)).thenReturn(listOf(first))
        Mockito.`when`(outboxEventProcessor.process(first))
            .thenThrow(NoOutboxHandlerException(OutboxEventType.NOTE_INDEX_REQUESTED))

        poller.poll()

        Mockito.verify(outboxService).claim(20)
        Mockito.verifyNoMoreInteractions(outboxService)
    }

    @Test
    fun `poll keeps processing remaining events when failure bookkeeping throws`() {
        val first = event()
        val second = event()
        Mockito.`when`(outboxService.claim(20)).thenReturn(listOf(first, second))
        Mockito.`when`(outboxEventProcessor.process(first)).thenThrow(RuntimeException("db down"))

        poller.poll()

        Mockito.verify(outboxEventProcessor).process(second)
    }

    @Test
    fun `poll does nothing when there is nothing to claim`() {
        Mockito.`when`(outboxService.claim(20)).thenReturn(emptyList())

        poller.poll()

        Mockito.verifyNoInteractions(outboxEventProcessor)
    }
}
