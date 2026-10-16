package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.InternalException
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.dto.response.NoteStatusResponse
import io.uliss.note_service.exception.IdempotencyKeyReusedException
import io.uliss.note_service.exception.NoteNotReadyException
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.SummaryRequestStatus
import io.uliss.note_service.model.projection.ChatNoteCount
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequest
import io.uliss.note_service.repository.SummaryRequestStore
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import reactor.test.StepVerifier
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.util.Optional
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NoteServiceTest {

    private val noteRepository = Mockito.mock(NoteRepository::class.java)
    private val chatNoteRepository = Mockito.mock(ChatNoteRepository::class.java)
    private val summaryRequestStore = Mockito.mock(SummaryRequestStore::class.java)
    private val outboxService = Mockito.mock(OutboxService::class.java)
    private val objectMapper = JsonMapper.builder().build()
    private val noteService = NoteService(
        noteRepository,
        chatNoteRepository,
        summaryRequestStore,
        outboxService,
        objectMapper,
    )

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
            .expectNext(NoteStatusResponse(note.id, NoteStatus.READY, updatedAt, false))
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
            .expectNext(NoteStatusResponse(generating.id, NoteStatus.GENERATING, null, false))
            .expectNext(NoteStatusResponse(ready.id, NoteStatus.READY, null, false))
            .expectComplete()
            .verify(Duration.ofSeconds(4))

        Mockito.verify(noteRepository, Mockito.times(3)).findByIdAndUserId(generating.id, userId)
    }

    @Test
    fun `getNote reports a pending update only for a ready note`() {
        val userId = UUID.randomUUID()
        val ready = NoteEntity(userId, "summary", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val generating = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(ready.id, userId)).thenReturn(ready)
        Mockito.`when`(noteRepository.findByIdAndUserId(generating.id, userId)).thenReturn(generating)
        Mockito.`when`(summaryRequestStore.hasPendingForNote(ready.id)).thenReturn(true)
        Mockito.`when`(summaryRequestStore.hasPendingForNote(generating.id)).thenReturn(true)

        assertTrue(noteService.getNote(userId, ready.id).updating)
        assertFalse(noteService.getNote(userId, generating.id).updating)
    }

    @Test
    fun `getNote reads the pending flag before the note, so a concurrent update never reads as settled`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, "summary", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        noteService.getNote(userId, note.id)

        val order = Mockito.inOrder(summaryRequestStore, noteRepository)
        order.verify(summaryRequestStore).hasPendingForNote(note.id)
        order.verify(noteRepository).findByIdAndUserId(note.id, userId)
    }

    @Test
    fun `getNotes marks ready notes with a pending update`() {
        val userId = UUID.randomUUID()
        val updating = NoteEntity(userId, "summary", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val settled = NoteEntity(userId, "summary", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val generating = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByUserIdOrderByCreatedAtDescIdDesc(userId))
            .thenReturn(listOf(updating, settled, generating))
        Mockito.`when`(summaryRequestStore.findPendingNoteIds(userId)).thenReturn(setOf(updating.id, generating.id))

        val notes = noteService.getNotes(userId)

        assertEquals(listOf(true, false, false), notes.map { it.updating })
    }

    @Test
    fun `streamNoteStatus keeps a ready note open until its update finishes`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, "summary", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(summaryRequestStore.hasPendingForNote(note.id)).thenReturn(true, true, false)

        StepVerifier.create(noteService.streamNoteStatus(userId, note.id))
            .expectNext(NoteStatusResponse(note.id, NoteStatus.READY, null, true))
            .expectNext(NoteStatusResponse(note.id, NoteStatus.READY, null, false))
            .expectComplete()
            .verify(Duration.ofSeconds(4))
    }

    @Test
    fun `streamNoteStatus gives up on a note stuck in GENERATING`() {
        val userId = UUID.randomUUID()
        val generating = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(generating.id, userId)).thenReturn(generating)

        StepVerifier.withVirtualTime { noteService.streamNoteStatus(userId, generating.id) }
            .expectNext(NoteStatusResponse(generating.id, NoteStatus.GENERATING, null, false))
            .thenAwait(Duration.ofMinutes(10))
            .verifyComplete()
    }

    @Test
    fun `requestChatSummary saves a GENERATING placeholder, links it, and publishes a summary request`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val throughMessageId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(
            summaryRequestStore.reserve(
                anyValue(),
                anyValue(),
                anyValue(),
                anyValue(),
                anyValue(),
            )
        ).thenAnswer { invocation ->
            SummaryRequest(
                invocation.getArgument(0),
                invocation.getArgument(1),
                invocation.getArgument(2),
                invocation.getArgument(3),
                invocation.getArgument(4),
                Instant.now(),
            )
        }
        Mockito.`when`(noteRepository.saveAndFlush(anyValue())).thenAnswer { it.getArgument<NoteEntity>(0) }
        Mockito.`when`(chatNoteRepository.save(anyValue())).thenAnswer { it.getArgument<ChatNoteEntity>(0) }

        val note = noteService.requestChatSummary(userId, chatId, throughMessageId, idempotencyKey)

        assertEquals(userId, note.userId)
        assertEquals(null, note.content)
        assertEquals(NoteSource.CHAT_SUMMARY, note.source)
        assertEquals(NoteStatus.GENERATING, note.status)
        assertEquals(7, note.id.version())
        Mockito.verify(summaryRequestStore).reserve(
            userId,
            idempotencyKey,
            chatId,
            throughMessageId,
            note.id,
        )
        Mockito.verify(summaryRequestStore, Mockito.never()).find(anyValue(), anyValue())

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
    fun `requestChatSummary replay returns the original note without publishing again`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val originalNote = NoteEntity(userId, "ready", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        Mockito.`when`(summaryRequestStore.find(userId, idempotencyKey)).thenReturn(
            SummaryRequest(
                userId,
                idempotencyKey,
                chatId,
                UUID.randomUUID(),
                originalNote.id,
                Instant.now(),
            )
        )
        Mockito.`when`(noteRepository.findByIdAndUserId(originalNote.id, userId)).thenReturn(originalNote)

        val replayed = noteService.requestChatSummary(
            userId,
            chatId,
            UUID.randomUUID(),
            idempotencyKey,
        )

        assertEquals(originalNote, replayed)
        Mockito.verifyNoInteractions(chatNoteRepository, outboxService)
    }

    @Test
    fun `requestChatSummary reports an internal error when the winning reservation cannot be loaded`() {
        val error = assertFailsWith<InternalException> {
            noteService.requestChatSummary(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
            )
        }

        assertEquals(
            "summary request reservation detected an idempotency conflict, " +
                    "but the request created by the winning transaction could not be loaded",
            error.message,
        )
        Mockito.verifyNoInteractions(noteRepository, chatNoteRepository, outboxService)
    }

    @Test
    fun `requestChatSummary reports an internal error when the replayed note cannot be loaded`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(summaryRequestStore.find(userId, idempotencyKey)).thenReturn(
            SummaryRequest(
                userId,
                idempotencyKey,
                chatId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                Instant.now(),
            )
        )

        val error = assertFailsWith<InternalException> {
            noteService.requestChatSummary(userId, chatId, UUID.randomUUID(), idempotencyKey)
        }

        assertEquals(
            "summary request was loaded after an idempotent retry, " +
                    "but its referenced note could not be found",
            error.message,
        )
        Mockito.verifyNoInteractions(chatNoteRepository, outboxService)
    }

    @Test
    fun `requestChatSummary rejects reuse for another chat`() {
        val userId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(summaryRequestStore.find(userId, idempotencyKey)).thenReturn(
            SummaryRequest(
                userId,
                idempotencyKey,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                Instant.now(),
            )
        )

        assertFailsWith<IdempotencyKeyReusedException> {
            noteService.requestChatSummary(userId, UUID.randomUUID(), UUID.randomUUID(), idempotencyKey)
        }
        Mockito.verifyNoInteractions(noteRepository, chatNoteRepository, outboxService)
    }

    @Test
    fun `requestChatSummaryUpdate reserves a request and publishes an update event without touching the note`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val note = NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val after = UUID.randomUUID()
        val through = UUID.randomUUID()
        val key = UUID.randomUUID()
        Mockito.`when`(summaryRequestStore.reserve(userId, key, chatId, through, note.id))
            .thenReturn(SummaryRequest(userId, key, chatId, through, note.id, Instant.now()))
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        val result = noteService.requestChatSummaryUpdate(userId, chatId, note.id, after, through, key)

        assertEquals(note, result)
        assertEquals("body", note.content)
        val payload = publishedPayload(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED)
        listOf(note.id, userId, chatId, key, after, through).forEach { assertTrue(payload.contains(it.toString())) }
        Mockito.verify(noteRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `requestChatSummaryUpdate replays an existing key without publishing`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val note = NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val key = UUID.randomUUID()
        Mockito.`when`(summaryRequestStore.find(userId, key))
            .thenReturn(SummaryRequest(userId, key, chatId, UUID.randomUUID(), note.id, Instant.now()))
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        assertEquals(note, noteService.requestChatSummaryUpdate(userId, chatId, note.id, null, UUID.randomUUID(), key))
        Mockito.verifyNoInteractions(outboxService)
    }

    @Test
    fun `findSummaryReplay rejects a key used for another chat`() {
        val userId = UUID.randomUUID()
        val key = UUID.randomUUID()
        Mockito.`when`(summaryRequestStore.find(userId, key))
            .thenReturn(SummaryRequest(userId, key, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), Instant.now()))

        assertFailsWith<IdempotencyKeyReusedException> {
            noteService.findSummaryReplay(userId, UUID.randomUUID(), key)
        }
    }

    @Test
    fun `completeChatSummary changes a generating note to ready and publishes indexing`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(noteRepository.save(note)).thenReturn(note)

        val completed = noteService.completeChatSummary(userId, note.id, "Summary title", "summary text")

        assertTrue(completed)
        assertEquals("Summary title", note.title)
        assertEquals("summary text", note.content)
        assertEquals(NoteStatus.READY, note.status)
        val payload = publishedPayload(OutboxEventType.NOTE_INDEX_REQUESTED)
        assertTrue(payload.contains(note.id.toString()))
        assertTrue(payload.contains(userId.toString()))
    }

    @Test
    fun `completeChatSummary marks the request applied and moves the chat boundary`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val throughMessageId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        val link = ChatNoteEntity(ChatNoteId(chatId, note.id))
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(summaryRequestStore.finishPendingForNote(note.id, SummaryRequestStatus.APPLIED)).thenReturn(
            SummaryRequest(userId, UUID.randomUUID(), chatId, throughMessageId, note.id, Instant.now()),
        )
        Mockito.`when`(chatNoteRepository.findById(ChatNoteId(chatId, note.id))).thenReturn(Optional.of(link))

        assertTrue(noteService.completeChatSummary(userId, note.id, "Title", "Body"))

        assertEquals(throughMessageId, link.summarizedThroughMessageId)
        Mockito.verify(chatNoteRepository).save(link)
    }

    @Test
    fun `completeChatSummary keeps the note ready when no request is pending`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        assertTrue(noteService.completeChatSummary(userId, note.id, "Title", "Body"))

        assertEquals(NoteStatus.READY, note.status)
        Mockito.verify(chatNoteRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `completeChatSummary ignores a late result for a note the outbox already failed`() {
        // the last attempt outlived its lease: the user was told to request a new summary, so the late one is dropped
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.FAILED)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        val completed = noteService.completeChatSummary(userId, note.id, "Late title", "late summary")

        assertEquals(false, completed)
        assertEquals(NoteStatus.FAILED, note.status)
        assertEquals(null, note.content)
        Mockito.verify(noteRepository, Mockito.never()).save(note)
        Mockito.verifyNoInteractions(outboxService)
    }

    @Test
    fun `completeChatSummary does nothing when the note is no longer generating`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, "existing", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        val completed = noteService.completeChatSummary(userId, note.id, "Late title", "late summary")

        assertEquals(false, completed)
        assertEquals(null, note.title)
        assertEquals("existing", note.content)
        Mockito.verify(noteRepository, Mockito.never()).save(note)
        Mockito.verifyNoInteractions(outboxService)
    }

    @Test
    fun `applyChatSummaryUpdate records nothing new and moves only the boundary`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val through = UUID.randomUUID()
        val note = NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val after = UUID.randomUUID()
        val link = ChatNoteEntity(ChatNoteId(chatId, note.id), after)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(summaryRequestStore.finish(userId, key, SummaryRequestStatus.NOTHING_NEW))
            .thenReturn(SummaryRequest(userId, key, chatId, through, note.id, Instant.now(), SummaryRequestStatus.NOTHING_NEW))
        Mockito.`when`(chatNoteRepository.findById(ChatNoteId(chatId, note.id))).thenReturn(Optional.of(link))

        assertTrue(noteService.applyChatSummaryUpdate(userId, key, note.id, chatId, after, through, null, LocalDate.now()))

        assertEquals("body", note.content)
        assertEquals(through, link.summarizedThroughMessageId)
        Mockito.verify(noteRepository, Mockito.never()).save(anyValue())
        Mockito.verifyNoInteractions(outboxService)
    }

    @Test
    fun `applyChatSummaryUpdate fails the request when the note is no longer ready`() {
        val userId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val noteId = UUID.randomUUID()

        assertFalse(
            noteService.applyChatSummaryUpdate(
                userId, key, noteId, UUID.randomUUID(), null, UUID.randomUUID(), "x", LocalDate.now(),
            )
        )
        Mockito.verify(summaryRequestStore).finish(userId, key, SummaryRequestStatus.FAILED)
    }

    @Test
    fun `applyChatSummaryUpdate fails a stale update whose boundary already moved`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val note = NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        // Another update already applied and moved the boundary past this request's start.
        val link = ChatNoteEntity(ChatNoteId(chatId, note.id), UUID.randomUUID())
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(chatNoteRepository.findById(ChatNoteId(chatId, note.id))).thenReturn(Optional.of(link))

        assertFalse(
            noteService.applyChatSummaryUpdate(
                userId, key, note.id, chatId, UUID.randomUUID(), UUID.randomUUID(), "Again.", LocalDate.now(),
            )
        )

        assertEquals("body", note.content)
        Mockito.verify(summaryRequestStore).finish(userId, key, SummaryRequestStatus.FAILED)
        Mockito.verifyNoInteractions(outboxService)
    }

    @Test
    fun `renameNote stores the normalized title and requests reindexing`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, "content", NoteSource.CHAT_SUMMARY, NoteStatus.READY, title = "Old")
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        val response = noteService.renameNote(userId, note.id, "  New  title ")

        assertEquals("New title", response.title)
        Mockito.verify(noteRepository).save(note)
        val payload = publishedPayload(OutboxEventType.NOTE_INDEX_REQUESTED)
        assertTrue(payload.contains(note.id.toString()))
    }

    @Test
    fun `renameNote rejects a note that is not ready`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        assertFailsWith<NoteNotReadyException> { noteService.renameNote(userId, note.id, "Title") }
        Mockito.verify(noteRepository, Mockito.never()).save(anyValue())
        Mockito.verifyNoInteractions(outboxService)
    }

    @Test
    fun `renameNote rejects an over-long title before loading the note`() {
        assertFailsWith<BadRequestException> {
            noteService.renameNote(UUID.randomUUID(), UUID.randomUUID(), "a".repeat(51))
        }
        Mockito.verifyNoInteractions(noteRepository)
    }

    @Test
    fun `deleteNote removes an owned note in any status`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        noteService.deleteNote(userId, note.id)

        Mockito.verify(noteRepository).delete(note)
    }

    @Test
    fun `deleteNote hides a missing or foreign note behind not found`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteRepository.findByIdAndUserId(noteId, userId)).thenReturn(null)

        assertFailsWith<NotFoundException> { noteService.deleteNote(userId, noteId) }
    }

    @Test
    fun `getNoteCounts maps linked note counts by chat id`() {
        val withNotes = UUID.randomUUID()
        val withoutNotes = UUID.randomUUID()
        Mockito.`when`(chatNoteRepository.countNotesByChatIds(listOf(withNotes, withoutNotes)))
            .thenReturn(listOf(ChatNoteCount(withNotes, 2)))

        val counts = noteService.getNoteCounts(listOf(withNotes, withoutNotes))

        assertEquals(mapOf(withNotes to 2), counts)
    }

    @Test
    fun `getNoteCounts skips the query for no chats`() {
        assertEquals(emptyMap(), noteService.getNoteCounts(emptyList()))
        Mockito.verifyNoInteractions(chatNoteRepository)
    }

    private fun publishedPayload(expectedType: OutboxEventType): String {
        Mockito.verify(outboxService).publish(anyValue(), anyValue())
        val invocation = Mockito.mockingDetails(outboxService).invocations.single { it.method.name == "publish" }
        assertEquals(expectedType, invocation.arguments[0])
        return invocation.arguments[1] as String
    }
}
