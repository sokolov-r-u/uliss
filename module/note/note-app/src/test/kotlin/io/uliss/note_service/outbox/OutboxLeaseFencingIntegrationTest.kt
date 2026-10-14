package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.NoteSummaryRequestedPayload
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.OutboxEventRepository
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class OutboxLeaseFencingIntegrationTest {

    @Autowired
    lateinit var outboxService: OutboxService

    @Autowired
    lateinit var outboxEventRepository: OutboxEventRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var objectMapper: ObjectMapper

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
