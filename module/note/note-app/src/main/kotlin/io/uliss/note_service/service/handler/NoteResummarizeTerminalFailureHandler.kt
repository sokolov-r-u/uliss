package io.uliss.note_service.service.handler

import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.SummaryRequestStatus
import io.uliss.note_service.model.payload.NoteResummarizeRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxTerminalFailureHandler
import io.uliss.note_service.repository.SummaryRequestStore
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

/** A failed rewrite leaves the old text; only the request is closed so the chat can summarize again. */
@Component
class NoteResummarizeTerminalFailureHandler(
    private val objectMapper: ObjectMapper,
    private val summaryRequestStore: SummaryRequestStore,
) : OutboxTerminalFailureHandler {

    override val type: OutboxEventType = OutboxEventType.NOTE_RESUMMARIZE_REQUESTED

    override fun handleTerminalFailure(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, NoteResummarizeRequestedPayload::class.java)
        summaryRequestStore.finish(payload.userId, payload.idempotencyKey, SummaryRequestStatus.FAILED)
    }
}
