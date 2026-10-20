package io.uliss.note_service.outbox

import io.uliss.note_service.NoteIntegrationTest
import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.NoteSummaryRequestedPayload
import io.uliss.note_service.outbox.infra.OutboxEventProcessor
import io.uliss.note_service.policy.OutboxLeasePolicy
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.OutboxEventRepository
import io.uliss.note_service.service.NoteService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OutboxLeaseFencingIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var outboxService: OutboxService

    @Autowired
    lateinit var outboxEventRepository: OutboxEventRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var noteService: NoteService

    @Autowired
    lateinit var outboxLeasePolicy: OutboxLeasePolicy

    @Autowired
    lateinit var outboxProperties: OutboxProperties

    @Autowired
    lateinit var transactionManager: PlatformTransactionManager

    // claim() takes the oldest claimable rows; leftovers from other test classes would crowd out ours.
    @BeforeEach
    fun clearOutbox() {
        outboxEventRepository.deleteAll()
    }

    @Test
    fun `a worker whose lease was taken over cannot fail or complete the re-claimed event`() {
        val event = savePendingEvent(OutboxEventType.NOTE_INDEX_REQUESTED, "{}")
        val staleLease = checkNotNull(outboxService.claim(10).single().leaseId)
        expireLease(event.id)
        val currentLease = checkNotNull(outboxService.claim(10).single().leaseId)
        assertNotEquals(staleLease, currentLease)

        outboxService.recordFailure(event.id, staleLease, RuntimeException("late failure"))
        outboxService.complete(event.id, staleLease)

        val afterStaleCalls = outboxEventRepository.findById(event.id).orElseThrow()
        assertEquals(OutboxEventStatus.PROCESSING, afterStaleCalls.status)
        assertEquals(currentLease, afterStaleCalls.leaseId)
        assertNull(afterStaleCalls.lastError)

        outboxService.complete(event.id, currentLease)

        assertEquals(OutboxEventStatus.COMPLETED, outboxEventRepository.findById(event.id).orElseThrow().status)
    }

    @Test
    fun `an event whose worker dies on every attempt is failed after max attempts with its note`() {
        val userId = UUID.randomUUID()
        val note = noteRepository.save(NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING))
        val payload = objectMapper.writeValueAsString(
            NoteSummaryRequestedPayload(
                noteId = note.id,
                userId = userId,
                chatId = UUID.randomUUID(),
                throughMessageId = UUID.randomUUID(),
            )
        )
        val event = savePendingEvent(OutboxEventType.NOTE_SUMMARY_REQUESTED, payload)

        // max-attempts is 3 in test config; each worker "crashes": no complete/recordFailure, the lease expires.
        repeat(3) {
            assertEquals(listOf(event.id), outboxService.claim(10).map { it.id })
            expireLease(event.id)
        }

        assertTrue(outboxService.claim(10).isEmpty())
        val persisted = outboxEventRepository.findById(event.id).orElseThrow()
        assertEquals(OutboxEventStatus.FAILED, persisted.status)
        assertEquals(3, persisted.attempts)
        assertEquals(NoteStatus.FAILED, noteRepository.findById(note.id).orElseThrow().status)
    }

    @Test
    fun `a summary that arrives after its last lease expired is dropped and the note stays failed`() {
        val userId = UUID.randomUUID()
        val note = noteRepository.save(NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING))
        val event = savePendingEvent(OutboxEventType.NOTE_SUMMARY_REQUESTED, summaryPayload(note.id, userId))
        // two earlier workers died; the third is the last attempt
        repeat(2) {
            outboxService.claim(10)
            expireLease(event.id)
        }
        val lastAttempt = outboxService.claim(10).single()
        // The last worker waits for the provider (e.g. a long Retry-After) past its lease: the next poll fails the
        // event and the note, then the provider answers and the worker tries to save the draft as the real handler does.
        val slowSummaryHandler = object : OutboxHandler {
            override val type = OutboxEventType.NOTE_SUMMARY_REQUESTED
            override fun handle(event: OutboxEventEntity) {
                expireLease(event.id)
                assertTrue(outboxService.claim(10).isEmpty())
                assertEquals(NoteStatus.FAILED, noteRepository.findById(note.id).orElseThrow().status)
                noteService.completeChatSummary(userId, note.id, "Late title", "late summary")
            }
        }

        OutboxEventProcessor(outboxService, listOf(slowSummaryHandler)).process(lastAttempt)

        // late is late: the user was already told the summary failed and may have requested a new one
        val failedNote = noteRepository.findById(note.id).orElseThrow()
        assertEquals(NoteStatus.FAILED, failedNote.status)
        assertNull(failedNote.content)
        // the stale worker's completion is fenced off: the event keeps its terminal failure
        val failed = outboxEventRepository.findById(event.id).orElseThrow()
        assertEquals(OutboxEventStatus.FAILED, failed.status)
        assertNull(failed.leaseId)
        assertTrue(outboxEventRepository.findAll().none { it.type == OutboxEventType.NOTE_INDEX_REQUESTED })
    }

    @Test
    fun `an instance without a handler for the type never claims it, so the event keeps all its attempts`() {
        val event = savePendingEvent(OutboxEventType.NOTE_SUMMARY_REQUESTED, "{}")
        // e.g. an older instance during a rolling deploy that knows only the index handler
        val olderInstance = OutboxService(
            outboxEventRepository = outboxEventRepository,
            outboxLeasePolicy = outboxLeasePolicy,
            outboxProperties = outboxProperties,
            terminalFailureHandlers = emptyList(),
            handlers = listOf(handlerFor(OutboxEventType.NOTE_INDEX_REQUESTED)),
        )
        val inTransaction = TransactionTemplate(transactionManager)

        repeat(outboxProperties.maxAttempts + 1) {
            assertTrue(inTransaction.execute { olderInstance.claim(10) }.orEmpty().isEmpty())
        }

        val untouched = outboxEventRepository.findById(event.id).orElseThrow()
        assertEquals(OutboxEventStatus.PENDING, untouched.status)
        assertEquals(0, untouched.attempts)
        assertNull(untouched.leaseId)
        // an instance that has the handler still gets the event with its full attempt budget
        val claimed = outboxService.claim(10).single()
        assertEquals(event.id, claimed.id)
        assertEquals(1, claimed.attempts)
    }

    private fun handlerFor(handledType: OutboxEventType) = object : OutboxHandler {
        override val type = handledType
        override fun handle(event: OutboxEventEntity) = Unit
    }

    private fun summaryPayload(noteId: UUID, userId: UUID): String = objectMapper.writeValueAsString(
        NoteSummaryRequestedPayload(
            noteId = noteId,
            userId = userId,
            chatId = UUID.randomUUID(),
            throughMessageId = UUID.randomUUID(),
        )
    )

    private fun savePendingEvent(type: OutboxEventType, payload: String): OutboxEventEntity =
        outboxEventRepository.save(
            OutboxEventEntity(
                type = type,
                payload = payload,
                status = OutboxEventStatus.PENDING,
                attempts = 0,
                nextAttemptAt = Instant.now().minusSeconds(1),
                lastError = null,
            )
        )

    private fun expireLease(eventId: UUID) {
        val event = outboxEventRepository.findById(eventId).orElseThrow()
        event.nextAttemptAt = Instant.now().minusSeconds(1)
        outboxEventRepository.save(event)
    }
}
