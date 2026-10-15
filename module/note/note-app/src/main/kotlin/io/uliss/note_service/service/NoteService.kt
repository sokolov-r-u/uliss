package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.InternalException
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.dto.response.NoteResponse
import io.uliss.note_service.dto.response.NoteStatusResponse
import io.uliss.note_service.dto.response.toResponse
import io.uliss.note_service.dto.response.toStatusResponse
import io.uliss.note_service.exception.IdempotencyKeyReusedException
import io.uliss.note_service.exception.NoteNotReadyException
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.SummaryRequestStatus
import io.uliss.note_service.model.payload.NoteIndexRequestedPayload
import io.uliss.note_service.model.payload.NoteSummaryRequestedPayload
import io.uliss.note_service.model.payload.NoteSummaryUpdateRequestedPayload
import io.uliss.note_service.model.projection.CurrentChatSummary
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequestStore
import io.uliss.note_service.util.TitleNormalizer
import org.springframework.data.domain.PageRequest
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import reactor.core.scheduler.Schedulers
import tools.jackson.databind.ObjectMapper
import java.time.Duration
import java.time.LocalDate
import java.util.UUID

@Service
class NoteService(
    private val noteRepository: NoteRepository,
    private val chatNoteRepository: ChatNoteRepository,
    private val summaryRequestStore: SummaryRequestStore,
    private val outboxService: OutboxService,
    private val objectMapper: ObjectMapper,
) {

    fun getNotes(userId: UUID): List<NoteResponse> {
        val notes = noteRepository.findByUserIdOrderByCreatedAtDescIdDesc(userId)
        return notes.map { it.toResponse() }
    }

    fun getNote(userId: UUID, noteId: UUID): NoteResponse =
        getOwnedNote(userId, noteId).toResponse()

    /** Linked note counts keyed by chat id; chats without notes are absent. Callers pass owned chat ids only. */
    fun getNoteCounts(chatIds: Collection<UUID>): Map<UUID, Int> {
        if (chatIds.isEmpty()) return emptyMap()
        return chatNoteRepository.countNotesByChatIds(chatIds).associate { it.chatId to it.noteCount.toInt() }
    }

    /** The chat's latest READY summary note; null when there is none. Callers pass an owned chat id. */
    fun findCurrentChatSummary(chatId: UUID): CurrentChatSummary? = chatNoteRepository
        .findSummaries(chatId, NoteSource.CHAT_SUMMARY, NoteStatus.READY, PageRequest.of(0, 1))
        .firstOrNull()

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
            // A note stuck in GENERATING must not hold the connection and its DB polling forever.
            .take(STATUS_STREAM_TIMEOUT)
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
        idempotencyKey: UUID,
    ): NoteEntity {
        val candidateNote = NoteEntity(
            userId = userId,
            content = null,
            source = NoteSource.CHAT_SUMMARY,
            status = NoteStatus.GENERATING,
        )
        val reservation = summaryRequestStore.reserve(
            userId = userId,
            idempotencyKey = idempotencyKey,
            chatId = chatId,
            throughMessageId = throughMessageId,
            noteId = candidateNote.id,
        )

        if (reservation == null) return getReplayedSummary(userId, chatId, idempotencyKey)

        noteRepository.saveAndFlush(candidateNote)
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chatId, candidateNote.id)))
        val payload = objectMapper.writeValueAsString(
            NoteSummaryRequestedPayload(candidateNote.id, userId, chatId, throughMessageId)
        )
        outboxService.publish(OutboxEventType.NOTE_SUMMARY_REQUESTED, payload)
        return candidateNote
    }

    /** The note of an earlier request with this key; null when the key is new. */
    fun findSummaryReplay(userId: UUID, chatId: UUID, idempotencyKey: UUID): NoteEntity? {
        val existing = summaryRequestStore.find(userId, idempotencyKey) ?: return null
        if (existing.chatId != chatId) throw IdempotencyKeyReusedException()
        return noteRepository.findByIdAndUserId(existing.noteId, userId)
            ?: throw InternalException(
                "summary request was loaded after an idempotent retry, " +
                        "but its referenced note could not be found"
            )
    }

    /** Reserves an update of an existing READY note; the note itself changes only when the update is applied. */
    @Transactional
    fun requestChatSummaryUpdate(
        userId: UUID,
        chatId: UUID,
        noteId: UUID,
        afterMessageId: UUID?,
        throughMessageId: UUID,
        idempotencyKey: UUID,
    ): NoteEntity {
        summaryRequestStore.reserve(userId, idempotencyKey, chatId, throughMessageId, noteId)
            ?: return getReplayedSummary(userId, chatId, idempotencyKey)
        val payload = objectMapper.writeValueAsString(
            NoteSummaryUpdateRequestedPayload(noteId, userId, chatId, idempotencyKey, afterMessageId, throughMessageId)
        )
        outboxService.publish(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, payload)
        return getOwnedNote(userId, noteId)
    }

    /**
     * Saves a generated summary while the note is still GENERATING. A result arriving after the outbox failed the
     * note (its last attempt outlived the lease) is dropped: the user was already told to request a new summary.
     */
    @Transactional
    fun completeChatSummary(userId: UUID, noteId: UUID, title: String?, content: String): Boolean {
        require(content.isNotBlank()) { "summary content must not be blank" }
        val note = noteRepository.findByIdAndUserId(noteId, userId) ?: return false
        if (note.status != NoteStatus.GENERATING) return false

        note.title = title
        note.content = content
        note.status = NoteStatus.READY
        noteRepository.save(note)
        summaryRequestStore.finishPendingForNote(noteId, SummaryRequestStatus.APPLIED)
            ?.let { moveSummaryBoundary(it.chatId, noteId, it.throughMessageId) }
        val payload = objectMapper.writeValueAsString(NoteIndexRequestedPayload(note.id, userId))
        outboxService.publish(OutboxEventType.NOTE_INDEX_REQUESTED, payload)
        return true
    }

    fun findReadyNote(userId: UUID, noteId: UUID): NoteEntity? =
        noteRepository.findByIdAndUserId(noteId, userId)?.takeIf { it.status == NoteStatus.READY }

    /**
     * Applies an update outcome exactly once: a null [addendum] records NOTHING_NEW. Returns false when the note is
     * gone or no longer READY, when its boundary is no longer [afterMessageId] (another update already covered these
     * messages), or when the request already left PENDING (a redelivered event).
     */
    @Transactional
    fun applyChatSummaryUpdate(
        userId: UUID,
        idempotencyKey: UUID,
        noteId: UUID,
        chatId: UUID,
        afterMessageId: UUID?,
        throughMessageId: UUID,
        addendum: String?,
        appliedOn: LocalDate,
    ): Boolean {
        val note = findReadyNote(userId, noteId)
        val link = note?.let { chatNoteRepository.findByIdOrNull(ChatNoteId(chatId, noteId)) }
        if (note == null || link == null || link.summarizedThroughMessageId != afterMessageId) {
            summaryRequestStore.finish(userId, idempotencyKey, SummaryRequestStatus.FAILED)
            return false
        }
        val status = if (addendum == null) SummaryRequestStatus.NOTHING_NEW else SummaryRequestStatus.APPLIED
        summaryRequestStore.finish(userId, idempotencyKey, status) ?: return false
        if (addendum != null) {
            note.content = "${note.content.orEmpty().trimEnd()}\n\n---\n\n## $appliedOn\n\n$addendum"
            noteRepository.save(note)
            val payload = objectMapper.writeValueAsString(NoteIndexRequestedPayload(note.id, userId))
            outboxService.publish(OutboxEventType.NOTE_INDEX_REQUESTED, payload)
        }
        link.summarizedThroughMessageId = throughMessageId
        chatNoteRepository.save(link)
        return true
    }

    /** Renames a READY note and reindexes it, because the indexed text includes the title. */
    @Transactional
    fun renameNote(userId: UUID, noteId: UUID, rawTitle: String): NoteResponse {
        val title = TitleNormalizer.normalizeUserTitle(rawTitle)
            ?: throw BadRequestException(TitleNormalizer.USER_TITLE_RULE)
        val note = getOwnedNote(userId, noteId)
        if (note.status != NoteStatus.READY) throw NoteNotReadyException(noteId)
        note.title = title
        noteRepository.save(note)
        val payload = objectMapper.writeValueAsString(NoteIndexRequestedPayload(note.id, userId))
        outboxService.publish(OutboxEventType.NOTE_INDEX_REQUESTED, payload)
        return note.toResponse()
    }

    /** FK cascades remove the note's RAG chunks, chat links and summary request; chats survive. */
    @Transactional
    fun deleteNote(userId: UUID, noteId: UUID) {
        noteRepository.delete(getOwnedNote(userId, noteId))
    }

    private fun getReplayedSummary(userId: UUID, chatId: UUID, idempotencyKey: UUID): NoteEntity =
        findSummaryReplay(userId, chatId, idempotencyKey)
            ?: throw InternalException(
                "summary request reservation detected an idempotency conflict, " +
                        "but the request created by the winning transaction could not be loaded"
            )

    private fun moveSummaryBoundary(chatId: UUID, noteId: UUID, throughMessageId: UUID) {
        val link = chatNoteRepository.findByIdOrNull(ChatNoteId(chatId, noteId)) ?: return
        link.summarizedThroughMessageId = throughMessageId
        chatNoteRepository.save(link)
    }

    private fun NoteStatus.isTerminal(): Boolean = this == NoteStatus.READY || this == NoteStatus.FAILED

    private fun getOwnedNote(userId: UUID, noteId: UUID): NoteEntity =
        noteRepository.findByIdAndUserId(noteId, userId)
            ?: throw NotFoundException("note id=$noteId not found")

    private companion object {
        val STATUS_POLL_INTERVAL: Duration = Duration.ofSeconds(1)
        val STATUS_STREAM_TIMEOUT: Duration = Duration.ofMinutes(10)
    }
}
