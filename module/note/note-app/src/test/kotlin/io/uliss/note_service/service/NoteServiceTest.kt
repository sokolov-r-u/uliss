package io.uliss.note_service.service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.dto.NoteStatusResponse
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import reactor.test.StepVerifier
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class NoteServiceTest {

    private val noteRepository = Mockito.mock(NoteRepository::class.java)
    private val chatNoteRepository = Mockito.mock(ChatNoteRepository::class.java)
    private val outboxService = Mockito.mock(OutboxService::class.java)
    private val objectMapper = JsonMapper.builder().build()
    private val noteService = NoteService(noteRepository, chatNoteRepository, outboxService, objectMapper)

    @Test
    fun `getNotes returns only repository-owned notes in repository order`() {
        val userId = UUID.randomUUID()
        val linkedNote = NoteEntity(userId, "summary", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val manualNote = NoteEntity(userId, "manual", NoteSource.MANUAL, NoteStatus.READY)
        Mockito.`when`(noteRepository.findByUserIdOrderByCreatedAtDescIdDesc(userId))
            .thenReturn(listOf(linkedNote, manualNote))

        val notes = noteService.getNotes(userId)

        assertEquals(listOf(linkedNote.id, manualNote.id), notes.map { it.id })
        Mockito.verifyNoInteractions(chatNoteRepository)
    }

    @Test
    fun `getNote hides a missing or foreign note behind not found`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteRepository.findByIdAndUserId(noteId, userId)).thenReturn(null)

        assertFailsWith<NotFoundException> { noteService.getNote(userId, noteId) }
        Mockito.verifyNoInteractions(chatNoteRepository)
    }

    @Test
    fun `streamNoteStatus emits the current terminal state and completes immediately`() {
        val userId = UUID.randomUUID()
        val updatedAt = Instant.parse("2026-09-10T10:15:30Z")
        val note = NoteEntity(userId, "summary", NoteSource.CHAT_SUMMARY, NoteStatus.READY).apply {
            this.updatedAt = updatedAt
        }
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        StepVerifier.create(noteService.streamNoteStatus(userId, note.id))
            .expectNext(NoteStatusResponse(note.id, NoteStatus.READY, updatedAt))
            .verifyComplete()

        Mockito.verify(noteRepository).findByIdAndUserId(note.id, userId)
        Mockito.verifyNoInteractions(chatNoteRepository)
    }

    @Test
    fun `streamNoteStatus suppresses unchanged states and completes after a transition`() {
        val userId = UUID.randomUUID()
        val generating = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        val ready = NoteEntity(userId, "summary", NoteSource.CHAT_SUMMARY, NoteStatus.READY).apply {
            id = generating.id
        }
        Mockito.`when`(noteRepository.findByIdAndUserId(generating.id, userId))
            .thenReturn(generating, generating, ready)

        StepVerifier.create(noteService.streamNoteStatus(userId, generating.id))
            .expectNext(NoteStatusResponse(generating.id, NoteStatus.GENERATING, null))
            .expectNext(NoteStatusResponse(ready.id, NoteStatus.READY, null))
            .expectComplete()
            .verify(Duration.ofSeconds(4))

        Mockito.verify(noteRepository, Mockito.times(3)).findByIdAndUserId(generating.id, userId)
    }

    @Test
    fun `createChatSummary saves a CHAT_SUMMARY note, links it to the chat, and publishes an indexing event`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(noteRepository.save(anyValue())).thenAnswer { it.getArgument<NoteEntity>(0) }
        Mockito.`when`(chatNoteRepository.save(anyValue())).thenAnswer { it.getArgument<ChatNoteEntity>(0) }

        val note = noteService.createChatSummary(userId, chatId, "summary text")

        assertEquals(userId, note.userId)
        assertEquals("summary text", note.content)
        assertEquals(NoteSource.CHAT_SUMMARY, note.source)

        val linkCaptor = ArgumentCaptor.forClass(ChatNoteEntity::class.java)
        Mockito.verify(chatNoteRepository).save(linkCaptor.capture())
        assertEquals(chatId, linkCaptor.value.chatNoteId.chatId)
        assertEquals(note.id, linkCaptor.value.chatNoteId.noteId)

        val payload = publishedPayload(OutboxEventType.NOTE_INDEX_REQUESTED)
        assertTrue(payload.contains(note.id.toString()))
        assertTrue(payload.contains(userId.toString()))
    }

    @Test
    fun `requestChatSummary saves a GENERATING placeholder, links it, and publishes a summary request`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val throughMessageId = UUID.randomUUID()
        Mockito.`when`(noteRepository.save(anyValue())).thenAnswer { it.getArgument<NoteEntity>(0) }
        Mockito.`when`(chatNoteRepository.save(anyValue())).thenAnswer { it.getArgument<ChatNoteEntity>(0) }

        val note = noteService.requestChatSummary(userId, chatId, throughMessageId)

        assertEquals(userId, note.userId)
        assertEquals(null, note.content)
        assertEquals(NoteSource.CHAT_SUMMARY, note.source)
        assertEquals(NoteStatus.GENERATING, note.status)

        val linkCaptor = ArgumentCaptor.forClass(ChatNoteEntity::class.java)
        Mockito.verify(chatNoteRepository).save(linkCaptor.capture())
        assertEquals(chatId, linkCaptor.value.chatNoteId.chatId)
        assertEquals(note.id, linkCaptor.value.chatNoteId.noteId)

        val payload = publishedPayload(OutboxEventType.NOTE_SUMMARY_REQUESTED)
        assertTrue(payload.contains(note.id.toString()))
        assertTrue(payload.contains(userId.toString()))
        assertTrue(payload.contains(chatId.toString()))
        assertTrue(payload.contains(throughMessageId.toString()))
    }

    @Test
    fun `completeChatSummary changes a generating note to ready and publishes indexing`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(noteRepository.save(note)).thenReturn(note)

        val completed = noteService.completeChatSummary(userId, note.id, "summary text")

        assertTrue(completed)
        assertEquals("summary text", note.content)
        assertEquals(NoteStatus.READY, note.status)
        val payload = publishedPayload(OutboxEventType.NOTE_INDEX_REQUESTED)
        assertTrue(payload.contains(note.id.toString()))
        assertTrue(payload.contains(userId.toString()))
    }

    @Test
    fun `completeChatSummary does nothing when the note is no longer generating`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, "existing", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        val completed = noteService.completeChatSummary(userId, note.id, "late summary")

        assertEquals(false, completed)
        assertEquals("existing", note.content)
        Mockito.verify(noteRepository, Mockito.never()).save(note)
        Mockito.verifyNoInteractions(outboxService)
    }

    private fun publishedPayload(expectedType: OutboxEventType): String {
        Mockito.verify(outboxService).publish(anyValue(), anyValue())
        val invocation = Mockito.mockingDetails(outboxService).invocations.single { it.method.name == "publish" }
        assertEquals(expectedType, invocation.arguments[0])
        return invocation.arguments[1] as String
    }
}
