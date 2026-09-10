package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFails

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class OutboxTerminalFailureIntegrationTest {

    @Autowired
    lateinit var outboxService: OutboxService

    @Autowired
    lateinit var outboxEventRepository: OutboxEventRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Test
    fun `terminal summary failure atomically marks the event and note failed`() {
        val userId = UUID.randomUUID()
        val note = noteRepository.save(
            NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        )
        val event = saveProcessingEvent(
            objectMapper.writeValueAsString(
                NoteSummaryRequestedPayload(
                    noteId = note.id,
                    userId = userId,
                    chatId = UUID.randomUUID(),
                    throughMessageId = UUID.randomUUID(),
                )
            )
        )

        outboxService.recordFailure(event.id, RuntimeException("provider unavailable"))

        assertEquals(OutboxEventStatus.FAILED, outboxEventRepository.findById(event.id).orElseThrow().status)
        assertEquals(NoteStatus.FAILED, noteRepository.findById(note.id).orElseThrow().status)
    }

    @Test
    fun `terminal callback failure rolls back the outbox failure transition`() {
        val event = saveProcessingEvent("{}")

        assertFails {
            outboxService.recordFailure(event.id, RuntimeException("provider unavailable"))
        }

        val persisted = outboxEventRepository.findById(event.id).orElseThrow()
        assertEquals(OutboxEventStatus.PROCESSING, persisted.status)
        assertEquals(2, persisted.attempts)
    }

    private fun saveProcessingEvent(payload: String): OutboxEventEntity = outboxEventRepository.save(
        OutboxEventEntity(
            type = OutboxEventType.NOTE_SUMMARY_REQUESTED,
            payload = payload,
            status = OutboxEventStatus.PROCESSING,
            attempts = 2,
            nextAttemptAt = Instant.now(),
            lastError = null,
        )
    )
}
