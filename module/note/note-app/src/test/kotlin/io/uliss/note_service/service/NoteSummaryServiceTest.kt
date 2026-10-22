package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.InternalException
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.eqValue
import io.uliss.note_service.dto.response.NoteStatusResponse
import io.uliss.note_service.exception.IdempotencyKeyReusedException
import io.uliss.note_service.exception.NoteNotReadyException
import io.uliss.note_service.exception.NoteUpdatingException
import io.uliss.note_service.exception.NoteVersionConflictException
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
import io.uliss.note_service.repository.ConstellationRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequest
import io.uliss.note_service.repository.SummaryRequestStore
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.orm.ObjectOptimisticLockingFailureException
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

class NoteSummaryServiceTest {

    private val noteRepository = Mockito.mock(NoteRepository::class.java)
    private val chatNoteRepository = Mockito.mock(ChatNoteRepository::class.java)
    private val summaryRequestStore = Mockito.mock(SummaryRequestStore::class.java)
    private val outboxService = Mockito.mock(OutboxService::class.java)
    private val objectMapper = JsonMapper.builder().build()
    private val constellationRepository = Mockito.mock(ConstellationRepository::class.java)
    private val notePlacementService = Mockito.mock(NotePlacementService::class.java)
    private val noteHierarchyService = Mockito.mock(NoteHierarchyService::class.java)
    private val indexRequests = Mockito.mock(NoteIndexRequestService::class.java)
    private val noteSummaryService = NoteSummaryService(
        noteRepository,
        chatNoteRepository,
        summaryRequestStore,
        outboxService,
        objectMapper,
        notePlacementService,
        noteHierarchyService,
        indexRequests,
    )

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

        val note = noteSummaryService.requestChatSummary(userId, chatId, throughMessageId, idempotencyKey)

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
    fun `requestChatSummary places the new note in the chosen constellation after saving it`() {
        val userId = UUID.randomUUID()
        val constellationId = UUID.randomUUID()
        acceptReservations()
        Mockito.`when`(noteRepository.saveAndFlush(anyValue())).thenAnswer { it.getArgument<NoteEntity>(0) }

        val note = noteSummaryService.requestChatSummary(
            userId, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), constellationId,
        )

        val order = Mockito.inOrder(noteRepository, notePlacementService, outboxService)
        order.verify(noteRepository).saveAndFlush(note)
        order.verify(notePlacementService).add(userId, note.id, constellationId)
        order.verify(outboxService).publish(eqValue(OutboxEventType.NOTE_SUMMARY_REQUESTED), anyValue())
    }

    @Test
    fun `requestChatSummary hangs the new note under the chosen parent note after saving it`() {
        val userId = UUID.randomUUID()
        val parentNoteId = UUID.randomUUID()
        acceptReservations()
        Mockito.`when`(noteRepository.saveAndFlush(anyValue())).thenAnswer { it.getArgument<NoteEntity>(0) }

        val note = noteSummaryService.requestChatSummary(
            userId, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), parentNoteId = parentNoteId,
        )

        val order = Mockito.inOrder(noteRepository, noteHierarchyService, outboxService)
        order.verify(noteRepository).saveAndFlush(note)
        order.verify(noteHierarchyService).moveUnder(userId, note.id, parentNoteId)
        assertEquals(parentNoteId, note.parentNoteId)
        order.verify(outboxService).publish(eqValue(OutboxEventType.NOTE_SUMMARY_REQUESTED), anyValue())
        Mockito.verifyNoInteractions(notePlacementService)
    }

    @Test
    fun `requestChatSummary saves the user's title on the placeholder`() {
        acceptReservations()
        Mockito.`when`(noteRepository.saveAndFlush(anyValue())).thenAnswer { it.getArgument<NoteEntity>(0) }

        val note = noteSummaryService.requestChatSummary(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), title = "Giant Steps",
        )

        assertEquals("Giant Steps", note.title)
        assertEquals(NoteStatus.GENERATING, note.status)
        Mockito.verify(noteRepository).saveAndFlush(note)
    }

    @Test
    fun `requestChatSummary without a constellation leaves the note without a place`() {
        acceptReservations()
        Mockito.`when`(noteRepository.saveAndFlush(anyValue())).thenAnswer { it.getArgument<NoteEntity>(0) }

        noteSummaryService.requestChatSummary(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())

        Mockito.verifyNoInteractions(notePlacementService)
    }

    @Test
    fun `a replayed summary request keeps the original place even when another constellation is sent`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val originalNote = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        // The winner committed between our replay lookup and the reservation: reserve reports the conflict.
        Mockito.`when`(summaryRequestStore.find(userId, idempotencyKey)).thenReturn(
            SummaryRequest(userId, idempotencyKey, chatId, UUID.randomUUID(), originalNote.id, Instant.now()),
        )
        Mockito.`when`(noteRepository.findByIdAndUserId(originalNote.id, userId)).thenReturn(originalNote)

        val replayed = noteSummaryService.requestChatSummary(
            userId, chatId, UUID.randomUUID(), idempotencyKey, UUID.randomUUID(),
        )

        assertEquals(originalNote, replayed)
        Mockito.verifyNoInteractions(notePlacementService)
        Mockito.verifyNoInteractions(noteHierarchyService)
    }

    private fun acceptReservations() {
        Mockito.`when`(
            summaryRequestStore.reserve(anyValue(), anyValue(), anyValue(), anyValue(), anyValue()),
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

        val replayed = noteSummaryService.requestChatSummary(
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
            noteSummaryService.requestChatSummary(
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
            noteSummaryService.requestChatSummary(userId, chatId, UUID.randomUUID(), idempotencyKey)
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
            noteSummaryService.requestChatSummary(userId, UUID.randomUUID(), UUID.randomUUID(), idempotencyKey)
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

        val result = noteSummaryService.requestChatSummaryUpdate(userId, chatId, note.id, after, through, key)

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

        assertEquals(note, noteSummaryService.requestChatSummaryUpdate(userId, chatId, note.id, null, UUID.randomUUID(), key))
        Mockito.verifyNoInteractions(outboxService)
    }

    @Test
    fun `findSummaryReplay rejects a key used for another chat`() {
        val userId = UUID.randomUUID()
        val key = UUID.randomUUID()
        Mockito.`when`(summaryRequestStore.find(userId, key))
            .thenReturn(SummaryRequest(userId, key, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), Instant.now()))

        assertFailsWith<IdempotencyKeyReusedException> {
            noteSummaryService.findSummaryReplay(userId, UUID.randomUUID(), key)
        }
    }

    @Test
    fun `completeChatSummary changes a generating note to ready and indexes it at once`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(noteRepository.save(note)).thenReturn(note)

        val completed = noteSummaryService.completeChatSummary(userId, note.id, "Summary title", "summary text")

        assertTrue(completed)
        assertEquals("Summary title", note.title)
        assertEquals("summary text", note.content)
        assertEquals(NoteStatus.READY, note.status)
        // a new note is searchable at once, not after the reindex delay
        Mockito.verify(indexRequests).requestNow(userId, note.id)
        Mockito.verifyNoMoreInteractions(indexRequests)
    }

    @Test
    fun `completeChatSummary keeps the title the user gave the placeholder`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING, "Giant Steps")
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(noteRepository.save(note)).thenReturn(note)

        assertTrue(noteSummaryService.completeChatSummary(userId, note.id, "Model title", "summary text"))

        assertEquals("Giant Steps", note.title)
        assertEquals(NoteStatus.READY, note.status)
    }

    @Test
    fun `findGeneratingNote finds only a note still waiting for its summary`() {
        val userId = UUID.randomUUID()
        val generating = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING, "Giant Steps")
        val ready = NoteEntity(userId, "text", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        Mockito.`when`(noteRepository.findByIdAndUserId(generating.id, userId)).thenReturn(generating)
        Mockito.`when`(noteRepository.findByIdAndUserId(ready.id, userId)).thenReturn(ready)

        assertEquals(generating, noteSummaryService.findGeneratingNote(userId, generating.id))
        assertEquals(null, noteSummaryService.findGeneratingNote(userId, ready.id))
        assertEquals(null, noteSummaryService.findGeneratingNote(userId, UUID.randomUUID()))
    }

    @Test
    fun `completeChatSummary marks the request applied and moves the chat boundary`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val throughMessageId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        val link = ChatNoteEntity(ChatNoteId(chatId, note.id), userId)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(summaryRequestStore.finishPendingForNote(note.id, SummaryRequestStatus.APPLIED)).thenReturn(
            SummaryRequest(userId, UUID.randomUUID(), chatId, throughMessageId, note.id, Instant.now()),
        )
        Mockito.`when`(chatNoteRepository.findById(ChatNoteId(chatId, note.id))).thenReturn(Optional.of(link))

        assertTrue(noteSummaryService.completeChatSummary(userId, note.id, "Title", "Body"))

        assertEquals(throughMessageId, link.summarizedThroughMessageId)
        Mockito.verify(chatNoteRepository).save(link)
    }

    @Test
    fun `completeChatSummary keeps the note ready when no request is pending`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        assertTrue(noteSummaryService.completeChatSummary(userId, note.id, "Title", "Body"))

        assertEquals(NoteStatus.READY, note.status)
        Mockito.verify(chatNoteRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `completeChatSummary ignores a late result for a note the outbox already failed`() {
        // the last attempt outlived its lease: the user was told to request a new summary, so the late one is dropped
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.FAILED)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        val completed = noteSummaryService.completeChatSummary(userId, note.id, "Late title", "late summary")

        assertEquals(false, completed)
        assertEquals(NoteStatus.FAILED, note.status)
        assertEquals(null, note.content)
        Mockito.verify(noteRepository, Mockito.never()).save(note)
        Mockito.verifyNoInteractions(outboxService, indexRequests)
    }

    @Test
    fun `completeChatSummary does nothing when the note is no longer generating`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, "existing", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        val completed = noteSummaryService.completeChatSummary(userId, note.id, "Late title", "late summary")

        assertEquals(false, completed)
        assertEquals(null, note.title)
        assertEquals("existing", note.content)
        Mockito.verify(noteRepository, Mockito.never()).save(note)
        Mockito.verifyNoInteractions(outboxService, indexRequests)
    }

    @Test
    fun `applyChatSummaryUpdate records nothing new and moves only the boundary`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val through = UUID.randomUUID()
        val note = NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val after = UUID.randomUUID()
        val link = ChatNoteEntity(ChatNoteId(chatId, note.id), userId, after)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(summaryRequestStore.finish(userId, key, SummaryRequestStatus.NOTHING_NEW))
            .thenReturn(SummaryRequest(userId, key, chatId, through, note.id, Instant.now(), SummaryRequestStatus.NOTHING_NEW))
        Mockito.`when`(chatNoteRepository.findById(ChatNoteId(chatId, note.id))).thenReturn(Optional.of(link))

        assertTrue(noteSummaryService.applyChatSummaryUpdate(userId, key, note.id, chatId, after, through, null, LocalDate.now()))

        assertEquals("body", note.content)
        assertEquals(through, link.summarizedThroughMessageId)
        Mockito.verify(noteRepository, Mockito.never()).save(anyValue())
        Mockito.verifyNoInteractions(outboxService, indexRequests)
    }

    @Test
    fun `applyChatSummaryUpdate appends the addendum and reindexes the note later`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val through = UUID.randomUUID()
        val note = NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val after = UUID.randomUUID()
        val link = ChatNoteEntity(ChatNoteId(chatId, note.id), userId, after)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(summaryRequestStore.finish(userId, key, SummaryRequestStatus.APPLIED))
            .thenReturn(SummaryRequest(userId, key, chatId, through, note.id, Instant.now(), SummaryRequestStatus.APPLIED))
        Mockito.`when`(chatNoteRepository.findById(ChatNoteId(chatId, note.id))).thenReturn(Optional.of(link))

        assertTrue(
            noteSummaryService.applyChatSummaryUpdate(userId, key, note.id, chatId, after, through, "More", LocalDate.now())
        )

        assertTrue(note.content.orEmpty().endsWith("More"))
        Mockito.verify(indexRequests).requestLater(userId, listOf(note.id))
        Mockito.verifyNoMoreInteractions(indexRequests)
        Mockito.verifyNoInteractions(outboxService)
    }

    @Test
    fun `applyChatSummaryUpdate refuses an addendum that would grow the note past the editable limit`() {
        // otherwise every later edit of the note is refused for being too long
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val after = UUID.randomUUID()
        val body = "x".repeat(99_990)
        val note = NoteEntity(userId, body, NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val link = ChatNoteEntity(ChatNoteId(chatId, note.id), userId, after)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(chatNoteRepository.findById(ChatNoteId(chatId, note.id))).thenReturn(Optional.of(link))

        assertFalse(
            noteSummaryService.applyChatSummaryUpdate(
                userId, key, note.id, chatId, after, UUID.randomUUID(), "A new paragraph.", LocalDate.now(),
            )
        )

        assertEquals(body, note.content)
        assertEquals(after, link.summarizedThroughMessageId)
        Mockito.verify(summaryRequestStore).finish(userId, key, SummaryRequestStatus.FAILED)
        Mockito.verifyNoInteractions(outboxService)
    }

    @Test
    fun `applyChatSummaryUpdate fails the request when the note is no longer ready`() {
        val userId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val noteId = UUID.randomUUID()

        assertFalse(
            noteSummaryService.applyChatSummaryUpdate(
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
        val link = ChatNoteEntity(ChatNoteId(chatId, note.id), userId, UUID.randomUUID())
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(chatNoteRepository.findById(ChatNoteId(chatId, note.id))).thenReturn(Optional.of(link))

        assertFalse(
            noteSummaryService.applyChatSummaryUpdate(
                userId, key, note.id, chatId, UUID.randomUUID(), UUID.randomUUID(), "Again.", LocalDate.now(),
            )
        )

        assertEquals("body", note.content)
        Mockito.verify(summaryRequestStore).finish(userId, key, SummaryRequestStatus.FAILED)
        Mockito.verifyNoInteractions(outboxService)
    }

    private fun readyNote(userId: UUID, version: Long): NoteEntity {
        val note = NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY, title = "Title")
        note.version = version
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        return note
    }

    private fun publishedPayload(expectedType: OutboxEventType): String {
        Mockito.verify(outboxService).publish(anyValue(), anyValue())
        val invocation = Mockito.mockingDetails(outboxService).invocations.single { it.method.name == "publish" }
        assertEquals(expectedType, invocation.arguments[0])
        return invocation.arguments[1] as String
    }
}
