package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.anyValue
import io.uliss.note_service.captorFor
import io.uliss.note_service.captureValue
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

private const val PROCESSING_TIMEOUT_MS = 20_000L

class OutboxServiceTest {

    private val outboxEventRepository = Mockito.mock(OutboxEventRepository::class.java)

    private fun mockHandler(type: OutboxEventType): OutboxHandler {
        val handler = Mockito.mock(OutboxHandler::class.java)
        Mockito.`when`(handler.type).thenReturn(type)
        return handler
    }

    private fun pendingEvent(attempts: Int = 0) = OutboxEventEntity(
        type = OutboxEventType.NOTE_INDEX_REQUESTED,
        payload = """{"noteId":"n"}""",
        status = OutboxEventStatus.PENDING,
        attempts = attempts,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )

    @Test
    fun `publish saves a PENDING event with zero attempts`() {
        val service = OutboxService(outboxEventRepository, emptyList(), PROCESSING_TIMEOUT_MS)
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.publish(OutboxEventType.NOTE_INDEX_REQUESTED, """{"noteId":"n"}""")

        val captor = org.mockito.ArgumentCaptor.forClass(OutboxEventEntity::class.java)
        Mockito.verify(outboxEventRepository).save(captor.capture())
        val saved = captor.value
        assertEquals(OutboxEventStatus.PENDING, saved.status)
        assertEquals(0, saved.attempts)
        assertNull(saved.lastError)
    }

    @Test
    fun `claim flips found events to PROCESSING, pushes the processing deadline and saves them`() {
        val service = OutboxService(outboxEventRepository, emptyList(), PROCESSING_TIMEOUT_MS)
        val event = pendingEvent()
        val before = Instant.now()
        Mockito.`when`(outboxEventRepository.findClaimable(anyValue(), anyValue(), anyValue()))
            .thenReturn(listOf(event))
        Mockito.`when`(outboxEventRepository.saveAll(anyValue<List<OutboxEventEntity>>()))
            .thenAnswer { it.getArgument<List<OutboxEventEntity>>(0) }

        val result = service.claim(20)

        assertEquals(OutboxEventStatus.PROCESSING, event.status)
        assertEquals(1, result.size)
        // Re-purposed as a visibility deadline while PROCESSING - see claim() kdoc comment.
        assertTrue(event.nextAttemptAt.isAfter(before.plusMillis(PROCESSING_TIMEOUT_MS - 1000)))
    }

    @Test
    fun `claim requests both PENDING and expired-PROCESSING events so a crashed worker's claim expires`() {
        val service = OutboxService(outboxEventRepository, emptyList(), PROCESSING_TIMEOUT_MS)
        val event = pendingEvent()
        Mockito.`when`(outboxEventRepository.findClaimable(anyValue(), anyValue(), anyValue()))
            .thenReturn(listOf(event))
        Mockito.`when`(outboxEventRepository.saveAll(anyValue<List<OutboxEventEntity>>()))
            .thenAnswer { it.getArgument<List<OutboxEventEntity>>(0) }
        val statusesCaptor = captorFor<List<OutboxEventStatus>>(List::class.java)

        service.claim(20)

        Mockito.verify(outboxEventRepository).findClaimable(statusesCaptor.captureValue(), anyValue(), anyValue())
        assertEquals(listOf(OutboxEventStatus.PENDING, OutboxEventStatus.PROCESSING), statusesCaptor.value)
    }

    @Test
    fun `process marks the event COMPLETED when the handler succeeds`() {
        val handler = mockHandler(OutboxEventType.NOTE_INDEX_REQUESTED)
        val service = OutboxService(outboxEventRepository, listOf(handler), PROCESSING_TIMEOUT_MS)
        val event = pendingEvent()
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.process(event)

        Mockito.verify(handler).handle(event)
        assertEquals(OutboxEventStatus.COMPLETED, event.status)
    }

    @Test
    fun `process reschedules with backoff and keeps PENDING below the attempt limit`() {
        val handler = mockHandler(OutboxEventType.NOTE_INDEX_REQUESTED)
        Mockito.`when`(handler.handle(anyValue())).thenThrow(RuntimeException("boom"))
        val service = OutboxService(outboxEventRepository, listOf(handler), PROCESSING_TIMEOUT_MS)
        val event = pendingEvent(attempts = 1)
        val before = event.nextAttemptAt
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.process(event)

        assertEquals(OutboxEventStatus.PENDING, event.status)
        assertEquals(2, event.attempts)
        assertEquals("boom", event.lastError)
        assertTrue(event.nextAttemptAt.isAfter(before))
    }

    @Test
    fun `process marks the event FAILED once the attempt limit is reached`() {
        val handler = mockHandler(OutboxEventType.NOTE_INDEX_REQUESTED)
        Mockito.`when`(handler.handle(anyValue())).thenThrow(RuntimeException("boom"))
        val service = OutboxService(outboxEventRepository, listOf(handler), PROCESSING_TIMEOUT_MS)
        // MAX_ATTEMPTS is 5 - the 5th failure (attempts 4 -> 5) is terminal.
        val event = pendingEvent(attempts = 4)
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.process(event)

        assertEquals(OutboxEventStatus.FAILED, event.status)
        assertEquals(5, event.attempts)
    }

    @Test
    fun `process throws NoOutboxHandlerException without touching attempts when no handler is registered`() {
        val service = OutboxService(outboxEventRepository, emptyList(), PROCESSING_TIMEOUT_MS)
        val event = pendingEvent()

        assertFailsWith<NoOutboxHandlerException> {
            service.process(event)
        }
        // Config bug, not a retryable failure - must not be counted as an attempt.
        Mockito.verify(outboxEventRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `recordFailure reloads the event fresh and applies the same backoff bookkeeping`() {
        val service = OutboxService(outboxEventRepository, emptyList(), PROCESSING_TIMEOUT_MS)
        val event = pendingEvent(attempts = 1)
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(java.util.Optional.of(event))
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.recordFailure(event.id, RuntimeException("save failed"))

        assertEquals(OutboxEventStatus.PENDING, event.status)
        assertEquals(2, event.attempts)
        assertEquals("save failed", event.lastError)
        Mockito.verify(outboxEventRepository).save(event)
    }

    @Test
    fun `recordFailure marks the event FAILED once the attempt limit is reached`() {
        val service = OutboxService(outboxEventRepository, emptyList(), PROCESSING_TIMEOUT_MS)
        // MAX_ATTEMPTS is 5 - the 5th failure (attempts 4 -> 5) is terminal.
        val event = pendingEvent(attempts = 4)
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(java.util.Optional.of(event))
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.recordFailure(event.id, RuntimeException("save failed"))

        assertEquals(OutboxEventStatus.FAILED, event.status)
        assertEquals(5, event.attempts)
    }

    @Test
    fun `recordFailure does nothing but log when the event no longer exists`() {
        val service = OutboxService(outboxEventRepository, emptyList(), PROCESSING_TIMEOUT_MS)
        val eventId = pendingEvent().id
        Mockito.`when`(outboxEventRepository.findById(eventId)).thenReturn(java.util.Optional.empty())

        service.recordFailure(eventId, RuntimeException("save failed"))

        Mockito.verify(outboxEventRepository, Mockito.never()).save(anyValue())
    }
}
