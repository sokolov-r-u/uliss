package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.SummaryRequestStatus
import io.uliss.note_service.model.payload.NoteSummaryUpdateRequestedPayload
import io.uliss.note_service.repository.SummaryRequestStore
import io.uliss.note_service.service.handler.NoteSummaryUpdateTerminalFailureHandler
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID

class NoteSummaryUpdateTerminalFailureHandlerTest {

    private val objectMapper = JsonMapper.builder().build()
    private val summaryRequestStore = Mockito.mock(SummaryRequestStore::class.java)
    private val handler = NoteSummaryUpdateTerminalFailureHandler(objectMapper, summaryRequestStore)

    @Test
    fun `handleTerminalFailure fails the pending update request and leaves the note alone`() {
        val payload = NoteSummaryUpdateRequestedPayload(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), null, UUID.randomUUID(),
        )
        val event = OutboxEventEntity(
            type = OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED,
            payload = objectMapper.writeValueAsString(payload),
            status = OutboxEventStatus.FAILED,
            attempts = 3,
            nextAttemptAt = Instant.now(),
            lastError = "provider unavailable",
        )

        handler.handleTerminalFailure(event)

        Mockito.verify(summaryRequestStore).finish(payload.userId, payload.idempotencyKey, SummaryRequestStatus.FAILED)
    }
}
