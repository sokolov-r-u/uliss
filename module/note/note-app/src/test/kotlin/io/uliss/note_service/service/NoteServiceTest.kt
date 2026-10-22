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
    private val indexRequests = Mockito.mock(NoteIndexRequestService::class.java)
    private val constellationRepository = Mockito.mock(ConstellationRepository::class.java)
    private val notePlacementService = Mockito.mock(NotePlacementService::class.java)
    private val noteHierarchyService = Mockito.mock(NoteHierarchyService::class.java)
    private val noteService = NoteService(
        noteRepository,
        chatNoteRepository,
        summaryRequestStore,
        indexRequests,
        constellationRepository,
    )

    @Test
    fun `notes of an owned constellation come in repository order with their update state`() {
        val userId = UUID.randomUUID()
        val constellationId = UUID.randomUUID()
        val updating = NoteEntity(userId, "a", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val settled = NoteEntity(userId, "b", NoteSource.MANUAL, NoteStatus.READY)
        Mockito.`when`(constellationRepository.existsByIdAndUserId(constellationId, userId)).thenReturn(true)
        Mockito.`when`(noteRepository.findInConstellation(userId, constellationId)).thenReturn(listOf(updating, settled))
        Mockito.`when`(summaryRequestStore.findPendingNoteIds(userId)).thenReturn(setOf(updating.id))

        val notes = noteService.getNotesInConstellation(userId, constellationId)

        assertEquals(listOf(updating.id to true, settled.id to false), notes.map { it.id to it.updating })
    }

    @Test
    fun `notes of a missing or foreign constellation are not found`() {
        val userId = UUID.randomUUID()

        assertFailsWith<NotFoundException> { noteService.getNotesInConstellation(userId, UUID.randomUUID()) }
    }

    @Test
    fun `notes without a constellation come from the repository`() {
        val userId = UUID.randomUUID()
        val loose = NoteEntity(userId, "loose", NoteSource.MANUAL, NoteStatus.READY)
        Mockito.`when`(noteRepository.findWithoutConstellation(userId)).thenReturn(listOf(loose))

        assertEquals(listOf(loose.id), noteService.getNotesWithoutConstellation(userId).map { it.id })
    }

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
    fun `sub-notes of a note come newest first with their update state`() {
        val userId = UUID.randomUUID()
        val parent = NoteEntity(userId, "parent")
        val child = NoteEntity(userId, "child", parentNoteId = parent.id)
        Mockito.`when`(noteRepository.findByIdAndUserId(parent.id, userId)).thenReturn(parent)
        Mockito.`when`(noteRepository.findByUserIdAndParentNoteIdOrderByCreatedAtDescIdDesc(userId, parent.id))
            .thenReturn(listOf(child))
        Mockito.`when`(summaryRequestStore.findPendingNoteIds(userId)).thenReturn(setOf(child.id))

        val subNotes = noteService.getSubNotes(userId, parent.id)

        assertEquals(listOf(Triple(child.id, parent.id, true)), subNotes.map { Triple(it.id, it.parentNoteId, it.updating) })
        assertFailsWith<NotFoundException> { noteService.getSubNotes(UUID.randomUUID(), parent.id) }
    }

    @Test
    fun `renameNote stores the normalized title and reindexes the note with its sub-notes later`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, "content", NoteSource.CHAT_SUMMARY, NoteStatus.READY, title = "Old")
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        val response = noteService.renameNote(userId, note.id, "  New  title ")

        assertEquals("New title", response.title)
        Mockito.verify(noteRepository).saveAndFlush(note)
        // sub-notes index the titles of their parents
        Mockito.verify(indexRequests).requestLaterWithSubNotes(userId, listOf(note.id))
        Mockito.verifyNoMoreInteractions(indexRequests)
    }

    @Test
    fun `renameNote rejects a note that is not ready`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        assertFailsWith<NoteNotReadyException> { noteService.renameNote(userId, note.id, "Title") }
        Mockito.verify(noteRepository, Mockito.never()).save(anyValue())
        Mockito.verifyNoInteractions(indexRequests)
    }

    @Test
    fun `renameNote is refused while a summary update is pending, as an edit is`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, "content", NoteSource.CHAT_SUMMARY, NoteStatus.READY, title = "Old")
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(summaryRequestStore.hasPendingForNote(note.id)).thenReturn(true)

        assertFailsWith<NoteUpdatingException> { noteService.renameNote(userId, note.id, "New") }
        assertEquals("Old", note.title)
        Mockito.verifyNoInteractions(indexRequests)
    }

    @Test
    fun `renameNote losing a concurrent write is a version conflict, not a server error`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, "content", NoteSource.CHAT_SUMMARY, NoteStatus.READY, title = "Old")
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        Mockito.`when`(noteRepository.saveAndFlush(note))
            .thenThrow(ObjectOptimisticLockingFailureException(NoteEntity::class.java, note.id))

        assertFailsWith<NoteVersionConflictException> { noteService.renameNote(userId, note.id, "New") }
        Mockito.verifyNoInteractions(indexRequests)
    }

    @Test
    fun `renameNote rejects an over-long title before loading the note`() {
        assertFailsWith<BadRequestException> {
            noteService.renameNote(UUID.randomUUID(), UUID.randomUUID(), "a".repeat(51))
        }
        Mockito.verifyNoInteractions(noteRepository)
    }

    @Test
    fun `updateNote stores the edited title and content and reindexes the note with its sub-notes later`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId, version = 3)

        val response = noteService.updateNote(userId, note.id, "  New  title ", "## New\n\nbody\n\n", 3)

        assertEquals("New title", response.title)
        assertEquals("## New\n\nbody", response.content)
        Mockito.verify(noteRepository).saveAndFlush(note)
        Mockito.verify(indexRequests).requestLaterWithSubNotes(userId, listOf(note.id))
        Mockito.verifyNoMoreInteractions(indexRequests)
    }

    @Test
    fun `updateNote of the content alone reindexes only the note later`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId, version = 3)

        noteService.updateNote(userId, note.id, "Title", "new body", 3)

        Mockito.verify(indexRequests).requestLater(userId, listOf(note.id))
        Mockito.verifyNoMoreInteractions(indexRequests)
    }

    @Test
    fun `updateNote with nothing changed neither saves nor reindexes`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId, version = 3)

        val response = noteService.updateNote(userId, note.id, "Title", "body\n", 3)

        assertEquals("body", response.content)
        Mockito.verify(noteRepository, Mockito.never()).saveAndFlush(anyValue())
        Mockito.verifyNoInteractions(indexRequests)
    }

    @Test
    fun `updateNote rejects blank content before loading the note`() {
        assertFailsWith<BadRequestException> {
            noteService.updateNote(UUID.randomUUID(), UUID.randomUUID(), "Title", " \n\t", 0)
        }
        Mockito.verifyNoInteractions(noteRepository)
    }

    @Test
    fun `updateNote rejects content over the length limit before loading the note`() {
        assertFailsWith<BadRequestException> {
            noteService.updateNote(UUID.randomUUID(), UUID.randomUUID(), "Title", "a".repeat(100_001), 0)
        }
        Mockito.verifyNoInteractions(noteRepository)
    }

    @Test
    fun `updateNote accepts content exactly at the length limit`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId, version = 0)

        val response = noteService.updateNote(userId, note.id, "Title", "a".repeat(100_000), 0)

        assertEquals(100_000, response.content?.length)
    }

    @Test
    fun `updateNote rejects a blank title before loading the note`() {
        assertFailsWith<BadRequestException> {
            noteService.updateNote(UUID.randomUUID(), UUID.randomUUID(), "   ", "body", 0)
        }
        Mockito.verifyNoInteractions(noteRepository)
    }

    @Test
    fun `updateNote rejects a note that is not ready`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING).apply { version = 0 }
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        assertFailsWith<NoteNotReadyException> { noteService.updateNote(userId, note.id, "Title", "body", 0) }
        Mockito.verify(noteRepository, Mockito.never()).saveAndFlush(anyValue())
        Mockito.verifyNoInteractions(indexRequests)
    }

    @Test
    fun `updateNote rejects a note whose summary update is still running`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId, version = 1)
        Mockito.`when`(summaryRequestStore.hasPendingForNote(note.id)).thenReturn(true)

        assertFailsWith<NoteUpdatingException> { noteService.updateNote(userId, note.id, "Title", "edited", 1) }
        Mockito.verify(noteRepository, Mockito.never()).saveAndFlush(anyValue())
        Mockito.verifyNoInteractions(indexRequests)
    }

    @Test
    fun `updateNote rejects an edit made against an older version`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId, version = 4)

        assertFailsWith<NoteVersionConflictException> {
            noteService.updateNote(userId, note.id, "Title", "edited", 3)
        }
        assertEquals("body", note.content)
        Mockito.verify(noteRepository, Mockito.never()).saveAndFlush(anyValue())
        Mockito.verifyNoInteractions(indexRequests)
    }

    @Test
    fun `updateNote reports a concurrent commit as a version conflict`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId, version = 2)
        Mockito.`when`(noteRepository.saveAndFlush(note))
            .thenThrow(ObjectOptimisticLockingFailureException(NoteEntity::class.java, note.id))

        assertFailsWith<NoteVersionConflictException> {
            noteService.updateNote(userId, note.id, "Title", "edited", 2)
        }
        Mockito.verifyNoInteractions(indexRequests)
    }

    @Test
    fun `updateNote hides a missing or foreign note behind not found`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteRepository.findByIdAndUserId(noteId, userId)).thenReturn(null)

        assertFailsWith<NotFoundException> { noteService.updateNote(userId, noteId, "Title", "body", 0) }
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

    @Test
    fun `checkNoteEditable accepts a ready note without a pending summary update`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId, version = 0)

        noteService.checkNoteEditable(userId, note.id)
    }

    @Test
    fun `checkNoteEditable treats a foreign note as missing`() {
        assertFailsWith<NotFoundException> { noteService.checkNoteEditable(UUID.randomUUID(), UUID.randomUUID()) }
    }

    @Test
    fun `checkNoteEditable rejects a note that is not ready`() {
        val userId = UUID.randomUUID()
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)

        assertFailsWith<NoteNotReadyException> { noteService.checkNoteEditable(userId, note.id) }
    }

    @Test
    fun `checkNoteEditable rejects a note whose summary update is still running`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId, version = 0)
        Mockito.`when`(summaryRequestStore.hasPendingForNote(note.id)).thenReturn(true)

        assertFailsWith<NoteUpdatingException> { noteService.checkNoteEditable(userId, note.id) }
    }

    private fun readyNote(userId: UUID, version: Long): NoteEntity {
        val note = NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY, title = "Title")
        note.version = version
        Mockito.`when`(noteRepository.findByIdAndUserId(note.id, userId)).thenReturn(note)
        return note
    }


    @Test
    fun `linked chats of a missing or foreign note are not found without reading links`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteRepository.findByIdAndUserId(noteId, userId)).thenReturn(null)

        assertFailsWith<NotFoundException> { noteService.getLinkedChatIds(userId, noteId) }
        Mockito.verify(chatNoteRepository, Mockito.never()).findChatIdsByNoteId(anyValue(), anyValue())
    }

    @Test
    fun `chat notes mark a ready note with a pending summary update as updating`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val updating = NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        val generating = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(summaryRequestStore.findPendingNoteIds(userId)).thenReturn(setOf(updating.id, generating.id))
        Mockito.`when`(chatNoteRepository.findNotesByChatId(userId, chatId)).thenReturn(listOf(updating, generating))

        val result = noteService.getChatNotes(userId, chatId)

        assertEquals(listOf(true, false), result.map { it.updating })
    }
}
