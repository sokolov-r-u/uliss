package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.eqValue
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import java.util.UUID

class NoteIndexRequestServiceTest {

    private val userId = UUID.randomUUID()
    private val outboxService = Mockito.mock(OutboxService::class.java)
    private val notes = InMemoryNoteHierarchyStore(InMemoryNoteConstellationStore())
    private val noteRepository = Mockito.mock(NoteRepository::class.java)
    private val service = NoteIndexRequestService(
        outboxService,
        notes.store,
        noteRepository,
        JsonMapper.builder().build(),
        NoteIndexRequestProperties(reindexDelay = Duration.ofMinutes(90)),
    )

    private val bowie = notes.add(userId, "Bowie")
    private val low = notes.add(userId, "Low", parentId = bowie)
    private val warszawa = notes.add(userId, "Warszawa", parentId = low)
    private val loose = notes.add(userId, "Loose")
    private val generating = notes.add(userId, null)

    init {
        // every note but the generating one is READY
        Mockito.`when`(noteRepository.findIdsByStatus(eqValue(userId), eqValue(NoteStatus.READY), anyValue()))
            .thenAnswer { invocation -> invocation.getArgument<Collection<UUID>>(2).filter { it != generating } }
    }

    @Test
    fun `an immediate request publishes a plain index event`() {
        service.requestNow(userId, loose)

        Mockito.verify(outboxService).publish(OutboxEventType.NOTE_INDEX_REQUESTED, payload(loose))
        Mockito.verifyNoMoreInteractions(outboxService)
    }

    @Test
    fun `a later request is debounced per note by the configured delay`() {
        service.requestLater(userId, listOf(low))

        verifyDebounced(low)
        Mockito.verifyNoMoreInteractions(outboxService)
    }

    @Test
    fun `a request with sub-notes covers every note below, whose inherited place changed too`() {
        service.requestLaterWithSubNotes(userId, listOf(bowie, loose))

        listOf(bowie, low, warszawa, loose).forEach(::verifyDebounced)
        Mockito.verifyNoMoreInteractions(outboxService)
    }

    @Test
    fun `a note that is not ready yet is left to its first index`() {
        service.requestLaterWithSubNotes(userId, listOf(generating))

        Mockito.verifyNoInteractions(outboxService)
    }

    @Test
    fun `nothing is published for no notes, nor for notes gone or foreign`() {
        service.requestLaterWithSubNotes(userId, emptyList())
        service.requestLaterWithSubNotes(UUID.randomUUID(), listOf(bowie))

        Mockito.verifyNoInteractions(outboxService)
    }

    private fun verifyDebounced(noteId: UUID) {
        Mockito.verify(outboxService).publishDebounced(
            OutboxEventType.NOTE_INDEX_REQUESTED,
            payload(noteId),
            "NOTE_INDEX_REQUESTED:$noteId",
            Duration.ofMinutes(90),
        )
    }

    private fun payload(noteId: UUID) = """{"noteId":"$noteId","userId":"$userId"}"""

    @Test
    fun `later requests are published in note id order, so parallel transactions lock the events alike`() {
        service.requestLaterWithSubNotes(userId, listOf(loose, bowie))

        val order = Mockito.inOrder(outboxService)
        listOf(bowie, low, warszawa, loose).sorted().forEach { noteId ->
            order.verify(outboxService).publishDebounced(
                OutboxEventType.NOTE_INDEX_REQUESTED,
                payload(noteId),
                "NOTE_INDEX_REQUESTED:$noteId",
                Duration.ofMinutes(90),
            )
        }
    }
}
