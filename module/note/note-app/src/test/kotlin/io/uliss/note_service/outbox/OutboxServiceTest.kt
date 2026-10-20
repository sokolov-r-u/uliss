package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.anyValue
import io.uliss.note_service.captorFor
import io.uliss.note_service.captureValue
import io.uliss.note_service.exception.NonRetryableOutboxException
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.policy.OutboxLeasePolicy
import io.uliss.note_service.repository.OutboxEventRepository
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.model.openai.autoconfigure.OpenAiChatProperties
import org.springframework.ai.model.openai.autoconfigure.OpenAiCommonProperties
import org.springframework.ai.model.openai.autoconfigure.OpenAiEmbeddingProperties
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.time.Clock
import java.util.Optional
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val INDEX_LEASE: Duration = Duration.ofMillis(156_650)
private val SUMMARY_LEASE: Duration = Duration.ofMillis(473_200)

private val NOW: Instant = Instant.parse("2026-10-21T10:00:00Z")

class OutboxServiceTest {

    private val outboxEventRepository = Mockito.mock(OutboxEventRepository::class.java)
    private val terminalFailureHandler = Mockito.mock(OutboxTerminalFailureHandler::class.java)
    private val leasePolicy = OutboxLeasePolicy(
        commonProperties = OpenAiCommonProperties(),
        chatProperties = OpenAiChatProperties(),
        embeddingProperties = OpenAiEmbeddingProperties().apply {
            timeout = Duration.ofSeconds(60)
            maxRetries = 1
        },
        outboxProperties = OutboxProperties(),
    )

    private fun service(
        maxAttempts: Int = 3,
        terminalFailureHandlers: List<OutboxTerminalFailureHandler> = emptyList(),
        handledTypes: List<OutboxEventType> = OutboxEventType.entries,
    ) = OutboxService(
        outboxEventRepository = outboxEventRepository,
        outboxLeasePolicy = leasePolicy,
        outboxProperties = OutboxProperties(maxAttempts = maxAttempts),
        terminalFailureHandlers = terminalFailureHandlers,
        handlers = handledTypes.map(::handlerFor),
        clock = Clock.fixed(NOW, ZoneOffset.UTC),
    )

    private fun handlerFor(handledType: OutboxEventType) = object : OutboxHandler {
        override val type = handledType
        override fun handle(event: OutboxEventEntity) = Unit
    }

    private fun pendingEvent(
        attempts: Int = 0,
        type: OutboxEventType = OutboxEventType.NOTE_INDEX_REQUESTED,
    ) = OutboxEventEntity(
        type = type,
        payload = """{"noteId":"n"}""",
        status = OutboxEventStatus.PENDING,
        attempts = attempts,
        nextAttemptAt = NOW,
        lastError = null,
    )

    private fun processingEvent(
        attempts: Int,
        leaseId: UUID,
        type: OutboxEventType = OutboxEventType.NOTE_INDEX_REQUESTED,
    ) = pendingEvent(attempts, type).also {
        it.status = OutboxEventStatus.PROCESSING
        it.leaseId = leaseId
    }

    private fun stubClaimable(vararg events: OutboxEventEntity) {
        Mockito.`when`(outboxEventRepository.findClaimable(anyValue(), anyValue(), anyValue(), anyValue()))
            .thenReturn(events.toList())
        Mockito.`when`(outboxEventRepository.saveAll(anyValue<List<OutboxEventEntity>>()))
            .thenAnswer { it.getArgument<List<OutboxEventEntity>>(0) }
    }

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
        stubClaimable(event)

        val result = service.claim(20)

        assertEquals(OutboxEventStatus.PROCESSING, event.status)
        assertEquals(listOf(event), result)
        // Re-purposed as a visibility deadline while PROCESSING - see claim() kdoc comment.
        assertEquals(NOW.plus(INDEX_LEASE), event.nextAttemptAt)
    }

    @Test
    fun `claim counts the delivery as an attempt so a worker crash still consumes one`() {
        val service = service()
        val event = pendingEvent(attempts = 1)
        stubClaimable(event)

        service.claim(1)

        assertEquals(2, event.attempts)
    }

    @Test
    fun `claim issues a new lease on every claim so a stale worker can be told apart`() {
        val service = service()
        val staleLease = UUID.randomUUID()
        val expired = processingEvent(attempts = 1, leaseId = staleLease)
        stubClaimable(expired)

        service.claim(1)

        assertNotNull(expired.leaseId)
        assertNotEquals(staleLease, expired.leaseId)
    }

    @Test
    fun `claim fails an expired event that already used its last attempt instead of running it again`() {
        Mockito.`when`(terminalFailureHandler.type).thenReturn(OutboxEventType.NOTE_SUMMARY_REQUESTED)
        val service = service(maxAttempts = 3, terminalFailureHandlers = listOf(terminalFailureHandler))
        val exhausted = processingEvent(
            attempts = 3,
            leaseId = UUID.randomUUID(),
            type = OutboxEventType.NOTE_SUMMARY_REQUESTED,
        )
        val fresh = pendingEvent()
        stubClaimable(exhausted, fresh)

        val result = service.claim(2)

        assertEquals(listOf(fresh), result)
        assertEquals(OutboxEventStatus.FAILED, exhausted.status)
        assertEquals(3, exhausted.attempts)
        assertNull(exhausted.leaseId)
        Mockito.verify(terminalFailureHandler).handleTerminalFailure(exhausted)
        val savedCaptor = captorFor<List<OutboxEventEntity>>(List::class.java)
        Mockito.verify(outboxEventRepository).saveAll(savedCaptor.captureValue())
        assertTrue(exhausted in savedCaptor.value)
    }

    @Test
    fun `claim derives a longer lease for summary processing`() {
        val service = service()
        val event = pendingEvent(type = OutboxEventType.NOTE_SUMMARY_REQUESTED)
        stubClaimable(event)

        service.claim(1)

        assertEquals(NOW.plus(SUMMARY_LEASE), event.nextAttemptAt)
    }

    @Test
    fun `claim requests both PENDING and expired-PROCESSING events so a crashed worker's claim expires`() {
        val service = service()
        stubClaimable(pendingEvent())
        val statusesCaptor = captorFor<List<OutboxEventStatus>>(List::class.java)

        service.claim(20)

        Mockito.verify(outboxEventRepository)
            .findClaimable(statusesCaptor.captureValue(), anyValue(), anyValue(), anyValue())
        assertEquals(listOf(OutboxEventStatus.PENDING, OutboxEventStatus.PROCESSING), statusesCaptor.value)
    }

    @Test
    fun `claim asks only for event types that have a registered handler`() {
        // e.g. an older instance during a rolling deploy must not burn attempts of a type it cannot handle
        val service = service(handledTypes = listOf(OutboxEventType.NOTE_INDEX_REQUESTED))
        stubClaimable(pendingEvent())
        val typesCaptor = captorFor<Collection<OutboxEventType>>(Collection::class.java)

        service.claim(20)

        Mockito.verify(outboxEventRepository)
            .findClaimable(anyValue(), typesCaptor.captureValue(), anyValue(), anyValue())
        assertEquals(setOf(OutboxEventType.NOTE_INDEX_REQUESTED), typesCaptor.value.toSet())
    }

    @Test
    fun `claim does not query when no handler is registered`() {
        val service = service(handledTypes = emptyList())

        assertTrue(service.claim(20).isEmpty())
        Mockito.verifyNoInteractions(outboxEventRepository)
    }

    @Test
    fun `complete marks the event COMPLETED when the caller still holds the lease`() {
        val service = service()
        val lease = UUID.randomUUID()
        val event = processingEvent(attempts = 1, leaseId = lease)
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(Optional.of(event))
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.complete(event.id, lease)

        assertEquals(OutboxEventStatus.COMPLETED, event.status)
        assertNull(event.leaseId)
        Mockito.verify(outboxEventRepository).save(event)
    }

    @Test
    fun `complete ignores a worker whose lease was taken over by a re-claim`() {
        val service = service()
        val currentLease = UUID.randomUUID()
        val event = processingEvent(attempts = 2, leaseId = currentLease)
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(Optional.of(event))

        service.complete(event.id, UUID.randomUUID())

        assertEquals(OutboxEventStatus.PROCESSING, event.status)
        assertEquals(currentLease, event.leaseId)
        Mockito.verify(outboxEventRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `complete ignores a non-PROCESSING event`() {
        val service = service()
        val event = pendingEvent()
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(Optional.of(event))

        service.complete(event.id, UUID.randomUUID())

        assertEquals(OutboxEventStatus.PENDING, event.status)
        Mockito.verify(outboxEventRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `recordFailure reschedules with backoff below the attempt limit without counting the attempt again`() {
        val service = service()
        val lease = UUID.randomUUID()
        val event = processingEvent(attempts = 1, leaseId = lease)
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(Optional.of(event))
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.recordFailure(event.id, lease, RuntimeException("boom"))

        assertEquals(OutboxEventStatus.PENDING, event.status)
        assertEquals(1, event.attempts)
        assertEquals("boom", event.lastError)
        assertNull(event.leaseId)
        // First failure backs off by the 30s base, spread by ±20%.
        assertTrue(!event.nextAttemptAt.isBefore(NOW.plusSeconds(24)), "${event.nextAttemptAt}")
        assertTrue(!event.nextAttemptAt.isAfter(NOW.plusSeconds(36)), "${event.nextAttemptAt}")
        Mockito.verify(outboxEventRepository).save(event)
    }

    @Test
    fun `recordFailure fails a non-retryable error on its first attempt and runs the terminal handler`() {
        val terminal = Mockito.mock(OutboxTerminalFailureHandler::class.java)
        Mockito.`when`(terminal.type).thenReturn(OutboxEventType.NOTE_SUMMARY_REQUESTED)
        val service = service(terminalFailureHandlers = listOf(terminal))
        val lease = UUID.randomUUID()
        val event = processingEvent(attempts = 1, leaseId = lease, type = OutboxEventType.NOTE_SUMMARY_REQUESTED)
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(Optional.of(event))
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.recordFailure(event.id, lease, NonRetryableOutboxException("chat is gone"))

        assertEquals(OutboxEventStatus.FAILED, event.status)
        Mockito.verify(terminal).handleTerminalFailure(event)
    }

    @Test
    fun `recordFailure marks the event FAILED when the failed attempt was the last one`() {
        Mockito.`when`(terminalFailureHandler.type).thenReturn(OutboxEventType.NOTE_SUMMARY_REQUESTED)
        val service = service(terminalFailureHandlers = listOf(terminalFailureHandler))
        val lease = UUID.randomUUID()
        val event = processingEvent(attempts = 3, leaseId = lease, type = OutboxEventType.NOTE_SUMMARY_REQUESTED)
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(Optional.of(event))
        Mockito.`when`(outboxEventRepository.save(anyValue())).thenAnswer { it.getArgument<OutboxEventEntity>(0) }

        service.recordFailure(event.id, lease, RuntimeException("boom"))

        assertEquals(OutboxEventStatus.FAILED, event.status)
        assertEquals(3, event.attempts)
        Mockito.verify(terminalFailureHandler).handleTerminalFailure(event)
    }

    @Test
    fun `recordFailure from a stale worker neither reschedules the re-claimed event nor fails it`() {
        Mockito.`when`(terminalFailureHandler.type).thenReturn(OutboxEventType.NOTE_SUMMARY_REQUESTED)
        val service = service(terminalFailureHandlers = listOf(terminalFailureHandler))
        val currentLease = UUID.randomUUID()
        val event = processingEvent(
            attempts = 3,
            leaseId = currentLease,
            type = OutboxEventType.NOTE_SUMMARY_REQUESTED,
        )
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(Optional.of(event))

        service.recordFailure(event.id, UUID.randomUUID(), RuntimeException("late failure"))

        assertEquals(OutboxEventStatus.PROCESSING, event.status)
        assertEquals(currentLease, event.leaseId)
        assertNull(event.lastError)
        Mockito.verify(terminalFailureHandler, Mockito.never()).handleTerminalFailure(anyValue())
        Mockito.verify(outboxEventRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `recordFailure does nothing but log when the event no longer exists`() {
        val service = service()
        val eventId = pendingEvent().id
        Mockito.`when`(outboxEventRepository.findById(eventId)).thenReturn(Optional.empty())

        service.recordFailure(eventId, UUID.randomUUID(), RuntimeException("save failed"))

        Mockito.verify(outboxEventRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `recordFailure ignores an event that is no longer processing`() {
        val service = service()
        val event = pendingEvent(attempts = 1).also { it.status = OutboxEventStatus.COMPLETED }
        Mockito.`when`(outboxEventRepository.findById(event.id)).thenReturn(Optional.of(event))

        service.recordFailure(event.id, UUID.randomUUID(), RuntimeException("late failure"))

        assertEquals(OutboxEventStatus.COMPLETED, event.status)
        assertEquals(1, event.attempts)
        Mockito.verify(outboxEventRepository, Mockito.never()).save(anyValue())
    }
}
