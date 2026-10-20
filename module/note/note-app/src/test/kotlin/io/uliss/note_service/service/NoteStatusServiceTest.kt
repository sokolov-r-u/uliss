package io.uliss.note_service.service

import io.uliss.note_service.dto.response.NoteStatusResponse
import io.uliss.note_service.exception.TooManyStatusStreamsException
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.projection.NoteStatusRow
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequestStore
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import reactor.test.StepVerifier
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.assertFailsWith

class NoteStatusServiceTest {

    private val noteRepository = Mockito.mock(NoteRepository::class.java)
    private val summaryRequestStore = Mockito.mock(SummaryRequestStore::class.java)
    private val service = NoteStatusService(noteRepository, summaryRequestStore, maxStreamsPerUser = 2)
    private val userId = UUID.randomUUID()

    private fun row(id: UUID, status: NoteStatus, updatedAt: Instant? = null) = NoteStatusRow(id, status, updatedAt)

    @Test
    fun `emits the current terminal state and completes immediately, reading no note content`() {
        val noteId = UUID.randomUUID()
        val updatedAt = Instant.parse("2026-09-10T10:15:30Z")
        Mockito.`when`(noteRepository.findStatusByIdAndUserId(noteId, userId))
            .thenReturn(row(noteId, NoteStatus.READY, updatedAt))

        StepVerifier.create(service.streamNoteStatus(userId, noteId))
            .expectNext(NoteStatusResponse(noteId, NoteStatus.READY, updatedAt, false))
            .verifyComplete()

        Mockito.verify(noteRepository, Mockito.never()).findByIdAndUserId(noteId, userId)
    }

    @Test
    fun `suppresses unchanged states and completes after a transition`() {
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteRepository.findStatusByIdAndUserId(noteId, userId))
            .thenReturn(row(noteId, NoteStatus.GENERATING), row(noteId, NoteStatus.GENERATING), row(noteId, NoteStatus.READY))

        // virtual time: the 1 s polls run instantly, no real waiting and no timeout to race
        StepVerifier.withVirtualTime { service.streamNoteStatus(userId, noteId) }
            .expectNext(NoteStatusResponse(noteId, NoteStatus.GENERATING, null, false))
            .thenAwait(Duration.ofSeconds(2))
            .expectNext(NoteStatusResponse(noteId, NoteStatus.READY, null, false))
            .verifyComplete()
    }

    @Test
    fun `keeps a ready note open until its update finishes`() {
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteRepository.findStatusByIdAndUserId(noteId, userId)).thenReturn(row(noteId, NoteStatus.READY))
        Mockito.`when`(summaryRequestStore.hasPendingForNote(noteId)).thenReturn(true, true, false)

        StepVerifier.withVirtualTime { service.streamNoteStatus(userId, noteId) }
            .expectNext(NoteStatusResponse(noteId, NoteStatus.READY, null, true))
            .thenAwait(Duration.ofSeconds(2))
            .expectNext(NoteStatusResponse(noteId, NoteStatus.READY, null, false))
            .verifyComplete()
    }

    @Test
    fun `gives up on a note stuck in GENERATING`() {
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteRepository.findStatusByIdAndUserId(noteId, userId)).thenReturn(row(noteId, NoteStatus.GENERATING))

        StepVerifier.withVirtualTime { service.streamNoteStatus(userId, noteId) }
            .expectNext(NoteStatusResponse(noteId, NoteStatus.GENERATING, null, false))
            .thenAwait(Duration.ofMinutes(10))
            .verifyComplete()
    }

    @Test
    fun `a user cannot hold more open streams than the limit, and a closed one frees its slot`() {
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteRepository.findStatusByIdAndUserId(noteId, userId)).thenReturn(row(noteId, NoteStatus.GENERATING))
        val first = service.streamNoteStatus(userId, noteId).subscribe()
        service.streamNoteStatus(userId, noteId).subscribe()

        assertFailsWith<TooManyStatusStreamsException> { service.streamNoteStatus(userId, noteId) }

        first.dispose()
        service.streamNoteStatus(userId, noteId).subscribe().dispose()
    }

    @Test
    fun `another user's streams do not count`() {
        val noteId = UUID.randomUUID()
        val otherUser = UUID.randomUUID()
        Mockito.`when`(noteRepository.findStatusByIdAndUserId(noteId, userId)).thenReturn(row(noteId, NoteStatus.GENERATING))
        Mockito.`when`(noteRepository.findStatusByIdAndUserId(noteId, otherUser)).thenReturn(row(noteId, NoteStatus.GENERATING))
        repeat(2) { service.streamNoteStatus(userId, noteId).subscribe() }

        service.streamNoteStatus(otherUser, noteId).subscribe().dispose()
    }
}
