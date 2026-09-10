package io.uliss.note_service.outbox

import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.NoteRepository
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

@Component
class NoteSummaryTerminalFailureHandler(
    private val objectMapper: ObjectMapper,
    private val noteRepository: NoteRepository,
) : OutboxTerminalFailureHandler {

    override val type: OutboxEventType = OutboxEventType.NOTE_SUMMARY_REQUESTED

    override fun handleTerminalFailure(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, NoteSummaryRequestedPayload::class.java)
        val note = noteRepository.findByIdAndUserId(payload.noteId, payload.userId) ?: return
        if (note.status != NoteStatus.GENERATING) return

        note.status = NoteStatus.FAILED
        noteRepository.save(note)
    }
}
