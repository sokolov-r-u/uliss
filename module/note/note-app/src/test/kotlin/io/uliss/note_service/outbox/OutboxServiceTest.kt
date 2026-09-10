package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.anyValue
import io.uliss.note_service.captorFor
import io.uliss.note_service.captureValue
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.model.openai.autoconfigure.OpenAiEmbeddingProperties
import org.springframework.ai.retry.autoconfigure.SpringAiRetryProperties
import org.springframework.boot.http.client.HttpClientSettings
import java.time.Duration
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val INDEX_LEASE: Duration = Duration.ofSeconds(156)
private val SUMMARY_LEASE: Duration = Duration.ofSeconds(494)

class OutboxServiceTest {

    private val outboxEventRepository = Mockito.mock(OutboxEventRepository::class.java)
    private val terminalFailureHandler = Mockito.mock(OutboxTerminalFailureHandler::class.java)
    private val leasePolicy = OutboxLeasePolicy(
        embeddingProperties = OpenAiEmbeddingProperties().apply {
            timeout = Duration.ofSeconds(60)
            maxRetries = 1
        },
        retryProperties = SpringAiRetryProperties().apply { maxAttempts = 2 },
        httpClientSettings = HttpClientSettings.defaults().withTimeouts(
            Duration.ofSeconds(10),
            Duration.ofSeconds(120),
        ),
        outboxProperties = OutboxProperties(),
    )

    private fun service(
        maxAttempts: Int = 3,
        terminalFailureHandlers: List<OutboxTerminalFailureHandler> = emptyList(),
    ) = OutboxService(
        outboxEventRepository = outboxEventRepository,
        outboxLeasePolicy = leasePolicy,
        outboxProperties = OutboxProperties(maxAttempts = maxAttempts),
        terminalFailureHandlers = terminalFailureHandlers,
    )

    private fun pendingEvent(
        attempts: Int = 0,
        type: OutboxEventType = OutboxEventType.NOTE_INDEX_REQUESTED,
    ) = OutboxEventEntity(
        type = type,
        payload = """{"noteId":"n"}""",
        status = OutboxEventStatus.PENDING,
        attempts = attempts,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )

    @Test
    fun `publish saves a PENDING event with zero attempts`() {
        val service = service()
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
        val service = service()
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
        assertTrue(event.nextAttemptAt.isAfter(before.plus(INDEX_LEASE).minusSeconds(1)))
    }

    @Test
    fun `claim derives a longer lease for summary processing`() {
        val service = service()
        val event = pendingEvent(type = OutboxEventType.NOTE_SUMMARY_REQUESTED)
        val before = Instant.now()
        Mockito.`when`(outboxEventRepository.findClaimable(anyValue(), anyValue(), anyValue()))
            .thenReturn(listOf(event))
        Mockito.`when`(outboxEventRepository.saveAll(anyValue<List<OutboxEventEntity>>()))
            .thenAnswer { it.getArgument<List<OutboxEventEntity>>(0) }

        service.claim(1)

        assertTrue(event.nextAttemptAt.isAfter(before.plus(SUMMARY_LEASE).minusSeconds(1)))
        assertTrue(event.nextAttemptAt.isBefore(before.plus(SUMMARY_LEASE).plusSeconds(1)))
    }

    @Test
    fun `claim requests both PENDING and expired-PROCESSING events so a crashed worker's claim expires`() {
        val service = service()
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
    fun `complete marks a PROCESSING event COMPLETED`() {
        val service = service()
        val event = pendingEvent().also { it.status = OutboxEventStatus.PROCESSING }
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(java.util.Optional.of(event))
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.complete(event.id)

        assertEquals(OutboxEventStatus.COMPLETED, event.status)
    }

    @Test
    fun `complete ignores a non-PROCESSING event`() {
        val service = service()
        val event = pendingEvent()
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(java.util.Optional.of(event))

        service.complete(event.id)

        assertEquals(OutboxEventStatus.PENDING, event.status)
        Mockito.verify(outboxEventRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `recordFailure reschedules with backoff and keeps PENDING below the attempt limit`() {
        val service = service()
        val event = pendingEvent(attempts = 1).also { it.status = OutboxEventStatus.PROCESSING }
        val before = event.nextAttemptAt
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(java.util.Optional.of(event))
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.recordFailure(event.id, RuntimeException("boom"))

        assertEquals(OutboxEventStatus.PENDING, event.status)
        assertEquals(2, event.attempts)
        assertEquals("boom", event.lastError)
        assertTrue(event.nextAttemptAt.isAfter(before))
    }

    @Test
    fun `recordFailure marks the event FAILED once the attempt limit is reached`() {
        Mockito.`when`(terminalFailureHandler.type).thenReturn(OutboxEventType.NOTE_SUMMARY_REQUESTED)
        val service = service(terminalFailureHandlers = listOf(terminalFailureHandler))
        val event = pendingEvent(attempts = 2, type = OutboxEventType.NOTE_SUMMARY_REQUESTED)
            .also { it.status = OutboxEventStatus.PROCESSING }
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(java.util.Optional.of(event))
        service.recordFailure(event.id, RuntimeException("boom"))

        assertEquals(OutboxEventStatus.FAILED, event.status)
        assertEquals(3, event.attempts)
        Mockito.verify(terminalFailureHandler).handleTerminalFailure(event)
    }

    @Test
    fun `recordFailure reloads the event fresh and applies the same backoff bookkeeping`() {
        val service = service()
        val event = pendingEvent(attempts = 1).also { it.status = OutboxEventStatus.PROCESSING }
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(java.util.Optional.of(event))
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.recordFailure(event.id, RuntimeException("save failed"))

        assertEquals(OutboxEventStatus.PENDING, event.status)
        assertEquals(2, event.attempts)
        assertEquals("save failed", event.lastError)
        Mockito.verify(outboxEventRepository).save(event)
    }

    @Test
    fun `recordFailure does nothing but log when the event no longer exists`() {
        val service = service()
        val eventId = pendingEvent().id
        Mockito.`when`(outboxEventRepository.findById(eventId)).thenReturn(java.util.Optional.empty())

        service.recordFailure(eventId, RuntimeException("save failed"))

        Mockito.verify(outboxEventRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `recordFailure ignores an event that is no longer processing`() {
        val service = service()
        val event = pendingEvent().also { it.status = OutboxEventStatus.COMPLETED }
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(java.util.Optional.of(event))

        service.recordFailure(event.id, RuntimeException("late failure"))

        assertEquals(OutboxEventStatus.COMPLETED, event.status)
        assertEquals(0, event.attempts)
        Mockito.verify(outboxEventRepository, Mockito.never()).save(anyValue())
    }
}
