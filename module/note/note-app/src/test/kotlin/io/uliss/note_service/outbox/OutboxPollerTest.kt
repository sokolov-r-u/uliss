package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.anyValue
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.time.Instant

class OutboxPollerTest {

    private val outboxService = Mockito.mock(OutboxService::class.java)
    private val poller = OutboxPoller(outboxService)

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

        Mockito.verify(outboxService).process(first)
        Mockito.verify(outboxService).process(second)
    }

    @Test
    fun `poll keeps processing remaining events when one process call throws`() {
        val first = event()
        val second = event()
        Mockito.`when`(outboxService.claim(20)).thenReturn(listOf(first, second))
        Mockito.`when`(outboxService.process(first)).thenThrow(RuntimeException("boom"))

        poller.poll()

        Mockito.verify(outboxService).process(first)
        Mockito.verify(outboxService).process(second)
    }

    @Test
    fun `poll records a compensating failure when process throws for a reason other than a missing handler`() {
        val first = event()
        val ex = RuntimeException("save failed")
        Mockito.`when`(outboxService.claim(20)).thenReturn(listOf(first))
        Mockito.`when`(outboxService.process(first)).thenThrow(ex)

        poller.poll()

        Mockito.verify(outboxService).recordFailure(first.id, ex)
    }

    @Test
    fun `poll does not record a compensating failure when process throws NoOutboxHandlerException`() {
        val first = event()
        Mockito.`when`(outboxService.claim(20)).thenReturn(listOf(first))
        Mockito.`when`(outboxService.process(first))
            .thenThrow(NoOutboxHandlerException(OutboxEventType.NOTE_INDEX_REQUESTED))

        poller.poll()

        Mockito.verify(outboxService, Mockito.never()).recordFailure(anyValue(), anyValue())
    }

    @Test
    fun `poll keeps processing remaining events when recordFailure itself throws`() {
        val first = event()
        val second = event()
        Mockito.`when`(outboxService.claim(20)).thenReturn(listOf(first, second))
        Mockito.`when`(outboxService.process(first)).thenThrow(RuntimeException("boom"))
        Mockito.`when`(outboxService.recordFailure(anyValue(), anyValue())).thenThrow(RuntimeException("db down"))

        poller.poll()

        Mockito.verify(outboxService).process(second)
    }

    @Test
    fun `poll does nothing when there is nothing to claim`() {
        Mockito.`when`(outboxService.claim(20)).thenReturn(emptyList())

        poller.poll()

        Mockito.verify(outboxService, Mockito.never()).process(anyValue())
    }
}
