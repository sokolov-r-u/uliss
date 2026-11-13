package io.uliss.note_service.service.handler

import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.SummaryRequestStatus
import io.uliss.note_service.model.payload.NoteSummaryBranchRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxTerminalFailureHandler
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequestStore
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

/**
 * A branch that could not be written fails alone: the chat's main note and boundary stay as they were. Reads the
 * stores directly, like the other terminal handlers: the outbox service, which the summary service publishes through,
 * depends on them.
 */
@Component
class NoteSummaryBranchTerminalFailureHandler(
    private val objectMapper: ObjectMapper,
    private val noteRepository: NoteRepository,
    private val summaryRequestStore: SummaryRequestStore,
) : OutboxTerminalFailureHandler {

    override val type: OutboxEventType = OutboxEventType.NOTE_SUMMARY_BRANCH_REQUESTED

    override fun handleTerminalFailure(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, NoteSummaryBranchRequestedPayload::class.java)
        val note = noteRepository.findByIdAndUserId(payload.noteId, payload.userId) ?: return
        if (note.status != NoteStatus.GENERATING) return

        note.status = NoteStatus.FAILED
        noteRepository.save(note)
        summaryRequestStore.finishPendingForNote(payload.noteId, SummaryRequestStatus.FAILED)
    }
}
