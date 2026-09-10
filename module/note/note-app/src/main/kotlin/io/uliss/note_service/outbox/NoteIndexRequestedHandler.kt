package io.uliss.note_service.outbox

import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.service.RagService
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

@Component
class NoteIndexRequestedHandler(
    private val objectMapper: ObjectMapper,
    private val noteRepository: NoteRepository,
    private val ragService: RagService,
) : OutboxHandler {

    override val type: OutboxEventType = OutboxEventType.NOTE_INDEX_REQUESTED

    override fun handle(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, NoteIndexRequestedPayload::class.java)
        val note = noteRepository.findByIdAndUserId(payload.noteId, payload.userId) ?: return
        val content = note.content?.takeIf { it.isNotBlank() } ?: return
        if (note.status != NoteStatus.READY) return
        ragService.index(payload.userId, note.id, content)
    }
}
