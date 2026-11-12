package io.uliss.note_service.service

import io.uliss.exception.common.InternalException
import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.exception.IdempotencyKeyReusedException
import io.uliss.note_service.exception.SummaryInProgressException
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.SummaryRequestStatus
import io.uliss.note_service.model.payload.NoteResummarizeRequestedPayload
import io.uliss.note_service.model.payload.NoteSummaryBranchRequestedPayload
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
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
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
    private val noteIndexRequestService: NoteIndexRequestService,
) {

    private val log = AppLogger.of(NoteSummaryService::class)

    /**
     * The chat's main summary note once it is READY; null when there is none, also when the chat only has notes
     * branched from it. Callers pass an owned chat id.
     */
    fun findCurrentChatSummary(chatId: UUID): CurrentChatSummary? =
        chatNoteRepository.findMainSummary(chatId, NoteSource.CHAT_SUMMARY, NoteStatus.READY)

    /**
     * Prepares the chat's notes for chat message [messageId] (a failed reply) being replaced by a retry: a summary
     * still being written through it keeps it, and a note that covers it now covers the message before it, so the
     * new reply counts as not yet summarized.
     *
     * @throws SummaryInProgressException when a pending summary request ends at [messageId]
     */
    @Transactional(propagation = Propagation.MANDATORY)
    fun releaseReplyForRetry(chatId: UUID, messageId: UUID) {
        if (summaryRequestStore.hasPendingThrough(chatId, messageId)) throw SummaryInProgressException(chatId)
        chatNoteRepository.moveBoundaryBefore(chatId, messageId)
    }

    /**
     * Persists the user-visible placeholder and its durable generation request together. The
     * summary worker later replaces the placeholder content and queues indexing after success.
     * A [constellationId] becomes the new note's main place, or a [parentNoteId] its parent, in the same transaction;
     * a replayed key keeps the place of its original request. A [title] is the user's name for the note; the worker
     * then keeps it instead of asking the model for one. An [icon] is the user's emoji; the model never sets one.
     */
    @Transactional
    fun requestChatSummary(
        userId: UUID,
        chatId: UUID,
        throughMessageId: UUID,
        idempotencyKey: UUID,
        constellationId: UUID? = null,
        parentNoteId: UUID? = null,
        title: String? = null,
        icon: String? = null,
    ): NoteEntity {
        val note = reservePlaceholder(
            userId, chatId, throughMessageId, idempotencyKey, constellationId, parentNoteId, title, icon, main = true,
        ) ?: return getReplayedSummary(userId, chatId, idempotencyKey)
        val payload = objectMapper.writeValueAsString(
            NoteSummaryRequestedPayload(note.id, userId, chatId, throughMessageId)
        )
        outboxService.publish(OutboxEventType.NOTE_SUMMARY_REQUESTED, payload)
        return note
    }

    /**
     * Reserves a new note for the messages after [afterMessageId], branched from the chat's main note [mainNoteId].
     * The placeholder takes its place, [title] and [icon] like a first summary; the main note and the chat's boundary
     * change only when the branch is written.
     */
    @Transactional
    fun requestChatSummaryBranch(
        userId: UUID,
        chatId: UUID,
        mainNoteId: UUID,
        afterMessageId: UUID?,
        throughMessageId: UUID,
        idempotencyKey: UUID,
        constellationId: UUID? = null,
        parentNoteId: UUID? = null,
        title: String? = null,
        icon: String? = null,
    ): NoteEntity {
        val note = reservePlaceholder(
            userId, chatId, throughMessageId, idempotencyKey, constellationId, parentNoteId, title, icon, main = false,
        ) ?: return getReplayedSummary(userId, chatId, idempotencyKey)
        val payload = objectMapper.writeValueAsString(
            NoteSummaryBranchRequestedPayload(note.id, userId, chatId, mainNoteId, afterMessageId, throughMessageId)
        )
        outboxService.publish(OutboxEventType.NOTE_SUMMARY_BRANCH_REQUESTED, payload)
        return note
    }

    /** The GENERATING note of a new summary request with its chat link and place; null when the key is a replay. */
    private fun reservePlaceholder(
        userId: UUID,
        chatId: UUID,
        throughMessageId: UUID,
        idempotencyKey: UUID,
        constellationId: UUID?,
        parentNoteId: UUID?,
        title: String?,
        icon: String?,
        main: Boolean,
    ): NoteEntity? {
        val candidateNote = NoteEntity(
            userId = userId,
            content = null,
            source = NoteSource.CHAT_SUMMARY,
            status = NoteStatus.GENERATING,
            title = title,
            icon = icon,
        )
        summaryRequestStore.reserve(
            userId = userId,
            idempotencyKey = idempotencyKey,
            chatId = chatId,
            throughMessageId = throughMessageId,
            noteId = candidateNote.id,
        ) ?: return null

        noteRepository.saveAndFlush(candidateNote)
        // a failed first attempt may still hold the mark
        if (main) chatNoteRepository.clearMain(chatId)
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chatId, candidateNote.id), userId, main = main))
        constellationId?.let { notePlacementService.add(userId, candidateNote.id, it) }
        parentNoteId?.let {
            noteHierarchyService.moveUnder(userId, candidateNote.id, it)
            // Stored through JDBC; the returned entity shows it too.
            candidateNote.parentNoteId = it
        }
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
     * Reserves a rewrite of a READY summary note from its whole chat through [throughMessageId]; the note changes only
     * when the rewrite is applied.
     */
    @Transactional
    fun requestResummarize(
        userId: UUID,
        chatId: UUID,
        noteId: UUID,
        throughMessageId: UUID,
        idempotencyKey: UUID,
    ): NoteEntity {
        summaryRequestStore.reserve(userId, idempotencyKey, chatId, throughMessageId, noteId)
            ?: return findResummarizeReplay(userId, noteId, idempotencyKey)
                ?: throw InternalException("resummarize reservation lost to a request that could not be loaded")
        val payload = objectMapper.writeValueAsString(
            NoteResummarizeRequestedPayload(noteId, userId, chatId, idempotencyKey, throughMessageId)
        )
        outboxService.publish(OutboxEventType.NOTE_RESUMMARIZE_REQUESTED, payload)
        return noteRepository.getOwnedNote(userId, noteId)
    }

    /**
     * Replaces the note's content and moves its boundary to [throughMessageId] in one transaction; title, icon and
     * place stay. Returns false when the request already left PENDING (a redelivered event), or when the note is gone,
     * no longer READY or no longer linked to the chat; the last case also closes the request as FAILED.
     */
    @Transactional
    fun applyResummarize(
        userId: UUID,
        idempotencyKey: UUID,
        noteId: UUID,
        chatId: UUID,
        throughMessageId: UUID,
        content: String,
    ): Boolean {
        val note = findReadyNote(userId, noteId)
        val link = note?.let { chatNoteRepository.findByIdOrNull(ChatNoteId(chatId, noteId)) }
        // a note past the editable limit could not be saved by its owner any more
        val tooLong = content.length > NoteContentNormalizer.MAX_CHARS
        if (note == null || link == null || tooLong) {
            log.warn(
                "resummarize of note id={} failed: note gone or not ready={}, unlinked={}, {} chars",
                "applyResummarize", noteId, note == null, link == null, content.length,
            )
            summaryRequestStore.finish(userId, idempotencyKey, SummaryRequestStatus.FAILED)
            return false
        }
        summaryRequestStore.finish(userId, idempotencyKey, SummaryRequestStatus.APPLIED) ?: return false
        note.content = content
        noteRepository.save(note)
        link.summarizedThroughMessageId = throughMessageId
        chatNoteRepository.save(link)
        // the whole text changed: searches should see it at once, as after a new summary
        noteIndexRequestService.requestNow(userId, noteId)
        return true
    }

    /** The note of an earlier resummarize with this key; null when the key is new. */
    fun findResummarizeReplay(userId: UUID, noteId: UUID, idempotencyKey: UUID): NoteEntity? {
        val existing = summaryRequestStore.find(userId, idempotencyKey) ?: return null
        if (existing.noteId != noteId) throw IdempotencyKeyReusedException()
        return noteRepository.getOwnedNote(userId, noteId)
    }

    /**
     * Saves a generated summary while the note is still GENERATING. A result arriving after the outbox failed the
     * note (its last attempt outlived the lease) is dropped: the user was already told to request a new summary.
     * A title the user gave the placeholder stays; [title] names only an unnamed note.
     */
    @Transactional
    fun completeChatSummary(userId: UUID, noteId: UUID, title: String?, content: String): Boolean {
        require(content.isNotBlank()) { "summary content must not be blank" }
        val note = noteRepository.findByIdAndUserId(noteId, userId) ?: return false
        if (note.status != NoteStatus.GENERATING) return false

        if (note.title == null) note.title = title
        note.content = content
        note.status = NoteStatus.READY
        noteRepository.save(note)
        summaryRequestStore.finishPendingForNote(noteId, SummaryRequestStatus.APPLIED)
            ?.let { moveSummaryBoundary(it.chatId, noteId, it.throughMessageId) }
        // a new note is searchable at once; only later changes wait for the reindex delay
        noteIndexRequestService.requestNow(userId, note.id)
        return true
    }

    /** The summary placeholder still waiting for its content; null once completed, failed or deleted. */
    fun findGeneratingNote(userId: UUID, noteId: UUID): NoteEntity? =
        noteRepository.findByIdAndUserId(noteId, userId)?.takeIf { it.status == NoteStatus.GENERATING }

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
            noteIndexRequestService.requestLater(userId, listOf(note.id))
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

    /**
     * The note now covers the chat through [throughMessageId]. A note branched from the main note moves the main
     * note's boundary too, since that one is the chat's: the next update reads only what came after the branch.
     */
    private fun moveSummaryBoundary(chatId: UUID, noteId: UUID, throughMessageId: UUID) {
        val link = chatNoteRepository.findByIdOrNull(ChatNoteId(chatId, noteId)) ?: return
        link.summarizedThroughMessageId = throughMessageId
        chatNoteRepository.save(link)
        if (link.main) return
        val mainLink = chatNoteRepository.findMainLink(chatId) ?: return
        mainLink.summarizedThroughMessageId = throughMessageId
        chatNoteRepository.save(mainLink)
    }
}
