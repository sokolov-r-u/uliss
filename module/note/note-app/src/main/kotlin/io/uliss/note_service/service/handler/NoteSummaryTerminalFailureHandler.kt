package io.uliss.note_service.service.handler

import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.SummaryRequestStatus
import io.uliss.note_service.model.payload.NoteSummaryRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxTerminalFailureHandler
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequestStore
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

@Component
class NoteSummaryTerminalFailureHandler(
    private val objectMapper: ObjectMapper,
    private val noteRepository: NoteRepository,
    private val summaryRequestStore: SummaryRequestStore,
) : OutboxTerminalFailureHandler {

    override val type: OutboxEventType = OutboxEventType.NOTE_SUMMARY_REQUESTED

    override fun handleTerminalFailure(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, NoteSummaryRequestedPayload::class.java)
        val note = noteRepository.findByIdAndUserId(payload.noteId, payload.userId) ?: return
        if (note.status != NoteStatus.GENERATING) return

        note.status = NoteStatus.FAILED
        noteRepository.save(note)
        summaryRequestStore.finishPendingForNote(payload.noteId, SummaryRequestStatus.FAILED)
    }
}
