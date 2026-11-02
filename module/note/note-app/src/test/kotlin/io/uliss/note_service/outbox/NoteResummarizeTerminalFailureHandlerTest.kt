package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.SummaryRequestStatus
import io.uliss.note_service.model.payload.NoteResummarizeRequestedPayload
import io.uliss.note_service.repository.SummaryRequestStore
import io.uliss.note_service.service.handler.NoteResummarizeTerminalFailureHandler
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID

class NoteResummarizeTerminalFailureHandlerTest {

    private val objectMapper = JsonMapper.builder().build()
    private val summaryRequestStore = Mockito.mock(SummaryRequestStore::class.java)
    private val handler = NoteResummarizeTerminalFailureHandler(objectMapper, summaryRequestStore)

    @Test
    fun `handleTerminalFailure fails the pending request and leaves the note alone`() {
        val payload = NoteResummarizeRequestedPayload(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
        )
        val event = OutboxEventEntity(
            type = OutboxEventType.NOTE_RESUMMARIZE_REQUESTED,
            payload = objectMapper.writeValueAsString(payload),
            status = OutboxEventStatus.FAILED,
            attempts = 3,
            nextAttemptAt = Instant.now(),
            lastError = "provider unavailable",
        )

        handler.handleTerminalFailure(event)

        Mockito.verify(summaryRequestStore).finish(payload.userId, payload.idempotencyKey, SummaryRequestStatus.FAILED)
        Mockito.verifyNoMoreInteractions(summaryRequestStore)
    }
}
