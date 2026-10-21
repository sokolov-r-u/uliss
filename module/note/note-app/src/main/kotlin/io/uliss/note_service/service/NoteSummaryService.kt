package io.uliss.note_service.service

import io.uliss.exception.common.InternalException
import io.uliss.note_service.exception.IdempotencyKeyReusedException
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
import io.uliss.note_service.util.NoteContentNormalizer
import io.uliss.note_service.util.getOwnedNote
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.domain.PageRequest
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper

/**
 * The life of a chat summary note: the request and its placeholder, the generated content, and later updates
 * appended from new chat messages. Split out of [NoteService], which keeps reading and editing notes.
 */
@Service
class NoteSummaryService(
    private val noteRepository: NoteRepository,
    private val chatNoteRepository: ChatNoteRepository,
    private val summaryRequestStore: SummaryRequestStore,
    private val outboxService: OutboxService,
    private val objectMapper: ObjectMapper,
    private val notePlacementService: NotePlacementService,
    private val noteHierarchyService: NoteHierarchyService,
) {

    /** The chat's latest READY summary note; null when there is none. Callers pass an owned chat id. */
    fun findCurrentChatSummary(chatId: UUID): CurrentChatSummary? = chatNoteRepository
        .findSummaries(chatId, NoteSource.CHAT_SUMMARY, NoteStatus.READY, PageRequest.of(0, 1))
        .firstOrNull()

    /**
     * Persists the user-visible placeholder and its durable generation request together. The
     * summary worker later replaces the placeholder content and queues indexing after success.
     * A [constellationId] becomes the new note's main place, or a [parentNoteId] its parent, in the same transaction;
     * a replayed key keeps the place of its original request.
     */
    @Transactional
    fun requestChatSummary(
        userId: UUID,
        chatId: UUID,
        throughMessageId: UUID,
        idempotencyKey: UUID,
        constellationId: UUID? = null,
        parentNoteId: UUID? = null,
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
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chatId, candidateNote.id), userId))
        constellationId?.let { notePlacementService.add(userId, candidateNote.id, it) }
        parentNoteId?.let {
            noteHierarchyService.moveUnder(userId, candidateNote.id, it)
            // Stored through JDBC; the returned entity shows it too.
            candidateNote.parentNoteId = it
        }
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
        return noteRepository.getOwnedNote(userId, noteId)
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

    /** Whether the summary placeholder still waits for its content: false once completed, failed or deleted. */
    fun isAwaitingSummary(userId: UUID, noteId: UUID): Boolean =
        noteRepository.findByIdAndUserId(noteId, userId)?.status == NoteStatus.GENERATING

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
        val content = addendum?.let { "${note?.content.orEmpty().trimEnd()}\n\n---\n\n## $appliedOn\n\n$it" }
        // a note past the editable limit could not be saved by its owner any more
        val tooLong = content != null && content.length > NoteContentNormalizer.MAX_CHARS
        if (note == null || link == null || link.summarizedThroughMessageId != afterMessageId || tooLong) {
            summaryRequestStore.finish(userId, idempotencyKey, SummaryRequestStatus.FAILED)
            return false
        }
        val status = if (addendum == null) SummaryRequestStatus.NOTHING_NEW else SummaryRequestStatus.APPLIED
        summaryRequestStore.finish(userId, idempotencyKey, status) ?: return false
        if (content != null) {
            note.content = content
            noteRepository.save(note)
            val payload = objectMapper.writeValueAsString(NoteIndexRequestedPayload(note.id, userId))
            outboxService.publish(OutboxEventType.NOTE_INDEX_REQUESTED, payload)
        }
        link.summarizedThroughMessageId = throughMessageId
        chatNoteRepository.save(link)
        return true
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
}
