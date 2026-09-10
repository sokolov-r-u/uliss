package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.anyValue
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals

class NoteSummaryTerminalFailureHandlerTest {

    private val objectMapper = JsonMapper.builder().build()
    private val noteRepository = Mockito.mock(NoteRepository::class.java)
    private val handler = NoteSummaryTerminalFailureHandler(objectMapper, noteRepository)

    @Test
    fun `handleTerminalFailure marks a generating user-owned note failed`() {
        val payload = payload()
        val note = NoteEntity(payload.userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(payload.noteId, payload.userId)).thenReturn(note)
        Mockito.`when`(noteRepository.save(anyValue())).thenAnswer { it.getArgument<NoteEntity>(0) }

        handler.handleTerminalFailure(event(payload))

        assertEquals(NoteStatus.FAILED, note.status)
        Mockito.verify(noteRepository).save(note)
    }

    @Test
    fun `handleTerminalFailure does not overwrite a ready note`() {
        val payload = payload()
        val note = NoteEntity(payload.userId, "summary", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        Mockito.`when`(noteRepository.findByIdAndUserId(payload.noteId, payload.userId)).thenReturn(note)

        handler.handleTerminalFailure(event(payload))

        assertEquals(NoteStatus.READY, note.status)
        Mockito.verify(noteRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `handleTerminalFailure ignores a missing or foreign note`() {
        val payload = payload()
        Mockito.`when`(noteRepository.findByIdAndUserId(payload.noteId, payload.userId)).thenReturn(null)

        handler.handleTerminalFailure(event(payload))

        Mockito.verify(noteRepository, Mockito.never()).save(anyValue())
    }

    private fun payload() = NoteSummaryRequestedPayload(
        noteId = UUID.randomUUID(),
        userId = UUID.randomUUID(),
        chatId = UUID.randomUUID(),
        throughMessageId = UUID.randomUUID(),
    )

    private fun event(payload: NoteSummaryRequestedPayload) = OutboxEventEntity(
        type = OutboxEventType.NOTE_SUMMARY_REQUESTED,
        payload = objectMapper.writeValueAsString(payload),
        status = OutboxEventStatus.FAILED,
        attempts = 3,
        nextAttemptAt = Instant.now(),
        lastError = "provider unavailable",
    )
}
