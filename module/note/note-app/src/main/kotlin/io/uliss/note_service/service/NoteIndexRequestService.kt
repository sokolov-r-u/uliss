package io.uliss.note_service.service

import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.payload.NoteIndexRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.NoteHierarchyStore
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.util.NoteHierarchy
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.util.UUID

/**
 * Queues RAG indexing of notes in the caller's transaction. A new note is indexed at once; a changed one waits
 * [NoteIndexRequestProperties.reindexDelay] after its last change, so reorganizing notes does not reindex on every
 * step. The handler reads the note when the event runs, so the index reflects the note at that time.
 */
@Service
class NoteIndexRequestService(
    private val outboxService: OutboxService,
    private val hierarchyStore: NoteHierarchyStore,
    private val noteRepository: NoteRepository,
    private val objectMapper: ObjectMapper,
    private val properties: NoteIndexRequestProperties,
) {

    fun requestNow(userId: UUID, noteId: UUID) {
        outboxService.publish(OutboxEventType.NOTE_INDEX_REQUESTED, payload(userId, noteId))
    }

    /**
     * Reindexes [noteIds] once they have not changed for the reindex delay. Only READY notes are indexed: a summary
     * note still generating gets its first index, with its place at that time, when it completes.
     */
    fun requestLater(userId: UUID, noteIds: Collection<UUID>) {
        if (noteIds.isEmpty()) return
        // one order for every transaction: two of them upserting the same events cannot deadlock
        noteRepository.findIdsByStatus(userId, NoteStatus.READY, noteIds).sorted().forEach { noteId ->
            outboxService.publishDebounced(
                OutboxEventType.NOTE_INDEX_REQUESTED,
                payload(userId, noteId),
                "${OutboxEventType.NOTE_INDEX_REQUESTED}:$noteId",
                properties.reindexDelay,
            )
        }
    }

    /** Like [requestLater], for [noteIds] and all their sub-notes, whose place and parent chain follow them. */
    fun requestLaterWithSubNotes(userId: UUID, noteIds: Collection<UUID>) {
        if (noteIds.isEmpty()) return
        val hierarchy = NoteHierarchy(hierarchyStore.findNodes(userId))
        val affected = noteIds.filter { hierarchy.find(it) != null }.flatMapTo(linkedSetOf()) { hierarchy.subtreeIds(it) }
        requestLater(userId, affected)
    }

    private fun payload(userId: UUID, noteId: UUID): String =
        objectMapper.writeValueAsString(NoteIndexRequestedPayload(noteId, userId))
}
