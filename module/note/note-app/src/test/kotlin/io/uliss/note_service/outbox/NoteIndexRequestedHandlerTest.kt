package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.service.RagService
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID

class NoteIndexRequestedHandlerTest {

    private val objectMapper = JsonMapper.builder().build()
    private val noteRepository = Mockito.mock(NoteRepository::class.java)
    private val ragService = Mockito.mock(RagService::class.java)
    private val handler = NoteIndexRequestedHandler(objectMapper, noteRepository, ragService)

    @Test
    fun `handle indexes a ready user-owned note`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, "A concise summary", NoteSource.CHAT_SUMMARY)
        val payload = NoteIndexRequestedPayload(note.id, userId)
        val event = event(objectMapper.writeValueAsString(payload))
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        handler.handle(event)

        Mockito.verify(ragService).index(userId, note.id, "A concise summary")
    }

    @Test
    fun `handle ignores a missing note`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteRepository.findByIdAndUserId(noteId, userId)).thenReturn(null)

        handler.handle(event(objectMapper.writeValueAsString(NoteIndexRequestedPayload(noteId, userId))))

        Mockito.verifyNoInteractions(ragService)
    }

    @Test
    fun `handle ignores a note that is not ready`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(
            userId = userId,
            content = "Summary in progress",
            source = NoteSource.CHAT_SUMMARY,
            status = NoteStatus.GENERATING,
        )
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        handler.handle(event(objectMapper.writeValueAsString(NoteIndexRequestedPayload(note.id, userId))))

        Mockito.verifyNoInteractions(ragService)
    }

    @Test
    fun `handle ignores a ready note with blank content`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, "   ", NoteSource.CHAT_SUMMARY)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        handler.handle(event(objectMapper.writeValueAsString(NoteIndexRequestedPayload(note.id, userId))))

        Mockito.verifyNoInteractions(ragService)
    }

    private fun event(payload: String) = OutboxEventEntity(
        type = OutboxEventType.NOTE_INDEX_REQUESTED,
        payload = payload,
        status = OutboxEventStatus.PROCESSING,
        attempts = 0,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )
}
