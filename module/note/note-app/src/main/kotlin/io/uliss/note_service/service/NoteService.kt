package io.uliss.note_service.service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.dto.NoteResponse
import io.uliss.note_service.dto.NoteStatusResponse
import io.uliss.note_service.dto.toResponse
import io.uliss.note_service.dto.toStatusResponse
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.outbox.NoteIndexRequestedPayload
import io.uliss.note_service.outbox.NoteSummaryRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.NoteRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import reactor.core.scheduler.Schedulers
import tools.jackson.databind.ObjectMapper
import java.time.Duration
import java.util.UUID

@Service
class NoteService(
    private val noteRepository: NoteRepository,
    private val chatNoteRepository: ChatNoteRepository,
    private val outboxService: OutboxService,
    private val objectMapper: ObjectMapper,
) {

    fun getNotes(userId: UUID): List<NoteResponse> {
        val notes = noteRepository.findByUserIdOrderByCreatedAtDescIdDesc(userId)
        return notes.map { it.toResponse() }
    }

    fun getNote(userId: UUID, noteId: UUID): NoteResponse =
        getOwnedNote(userId, noteId).toResponse()

    fun streamNoteStatus(userId: UUID, noteId: UUID): Flux<NoteStatusResponse> {
        val initialStatus = getOwnedNote(userId, noteId).toStatusResponse()
        val persistedStatuses = Flux.interval(STATUS_POLL_INTERVAL)
            .concatMap {
                Mono.fromCallable { getOwnedNote(userId, noteId).toStatusResponse() }
                    .subscribeOn(Schedulers.boundedElastic())
            }

        return persistedStatuses
            .startWith(initialStatus)
            .distinctUntilChanged { status -> status.status }
            .takeUntil { status -> status.status.isTerminal() }
    }

    /**
     * Persists the user-visible placeholder and its durable generation request together. The
     * summary worker later replaces the placeholder content and queues indexing after success.
     */
    @Transactional
    fun requestChatSummary(
        userId: UUID,
        chatId: UUID,
        throughMessageId: UUID,
    ): NoteEntity {
        val note = noteRepository.save(
            NoteEntity(
                userId = userId,
                content = null,
                source = NoteSource.CHAT_SUMMARY,
                status = NoteStatus.GENERATING,
            )
        )
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chatId, note.id)))
        val payload = objectMapper.writeValueAsString(
            NoteSummaryRequestedPayload(note.id, userId, chatId, throughMessageId)
        )
        outboxService.publish(OutboxEventType.NOTE_SUMMARY_REQUESTED, payload)
        return note
    }

    @Transactional
    fun completeChatSummary(userId: UUID, noteId: UUID, content: String): Boolean {
        require(content.isNotBlank()) { "summary content must not be blank" }
        val note = noteRepository.findByIdAndUserId(noteId, userId) ?: return false
        if (note.status != NoteStatus.GENERATING) return false

        note.content = content
        note.status = NoteStatus.READY
        noteRepository.save(note)
        val payload = objectMapper.writeValueAsString(NoteIndexRequestedPayload(note.id, userId))
        outboxService.publish(OutboxEventType.NOTE_INDEX_REQUESTED, payload)
        return true
    }

    /**
     * The note, the chat<->note link, and the indexing outbox event commit atomically - either all
     * three persist, or none do.
     */
    @Transactional
    fun createChatSummary(userId: UUID, chatId: UUID, content: String): NoteEntity {
        val note = noteRepository.save(NoteEntity(userId, content, NoteSource.CHAT_SUMMARY))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chatId, note.id)))
        val payload = objectMapper.writeValueAsString(NoteIndexRequestedPayload(note.id, userId))
        outboxService.publish(OutboxEventType.NOTE_INDEX_REQUESTED, payload)
        return note
    }

    private fun NoteStatus.isTerminal(): Boolean = this == NoteStatus.READY || this == NoteStatus.FAILED

    private fun getOwnedNote(userId: UUID, noteId: UUID): NoteEntity =
        noteRepository.findByIdAndUserId(noteId, userId)
            ?: throw NotFoundException("note id=$noteId not found")

    private companion object {
        val STATUS_POLL_INTERVAL: Duration = Duration.ofSeconds(1)
    }
}
