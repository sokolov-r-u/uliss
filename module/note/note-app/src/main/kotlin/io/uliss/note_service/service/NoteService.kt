package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.database.utils.generateId
import io.uliss.note_service.dto.internal.KeysetPage
import io.uliss.note_service.dto.internal.ListCursor
import io.uliss.note_service.dto.internal.NoteListPage
import io.uliss.note_service.dto.request.PosterCropRequest
import io.uliss.note_service.dto.response.NoteResponse
import io.uliss.note_service.dto.response.toResponse
import io.uliss.note_service.exception.IdempotencyKeyReusedException
import io.uliss.note_service.exception.NoteNotReadyException
import io.uliss.note_service.model.projection.RequestFingerprint
import io.uliss.note_service.exception.NoteUpdatingException
import io.uliss.note_service.exception.NoteVersionConflictException
import io.uliss.note_service.exception.PinLimitReachedException
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ConstellationRepository
import io.uliss.note_service.repository.NoteListStore
import io.uliss.note_service.repository.NotePosterStore
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequestStore
import io.uliss.note_service.util.ManualNoteFingerprint
import io.uliss.note_service.util.NoteContentNormalizer
import io.uliss.note_service.util.NoteIconNormalizer
import io.uliss.note_service.util.getOwnedNote
import io.uliss.note_service.util.PinLimit
import io.uliss.note_service.util.PosterCropValidator
import io.uliss.note_service.util.PosterUrlNormalizer
import io.uliss.note_service.util.TitleNormalizer
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class NoteService(
    private val noteRepository: NoteRepository,
    private val chatNoteRepository: ChatNoteRepository,
    private val summaryRequestStore: SummaryRequestStore,
    private val noteIndexRequestService: NoteIndexRequestService,
    private val constellationRepository: ConstellationRepository,
    private val noteListStore: NoteListStore,
    private val notePosterStore: NotePosterStore,
) {

    /**
     * A page of the user's notes by last change, starting strictly after [cursor] (from the newest when null), with the
     * size of the list and the number of all their notes. Non-empty [constellationIds] keep the notes of those
     * constellations' subtrees with their sub-notes. A note deleted between the reads is left out of the page.
     */
    fun getNotes(
        userId: UUID,
        cursor: ListCursor?,
        limit: Int,
        constellationIds: Set<UUID> = emptySet(),
    ): NoteListPage {
        val positions = KeysetPage.of(noteListStore.findPage(userId, cursor, limit + 1, constellationIds), limit) { it }
        val ids = positions.items.map { it.id }
        val page = KeysetPage(toResponses(userId) { orderedById(ids) }, positions.nextCursor)
        if (constellationIds.isEmpty()) return NoteListPage(page, noteListStore.count(userId))
        return NoteListPage(page, noteListStore.count(userId, constellationIds), noteListStore.count(userId))
    }

    /**
     * The user's pinned notes, last pinned first; the pages of [getNotes] leave them out. Non-empty [constellationIds]
     * keep the pinned notes of the same filter as [getNotes].
     */
    fun getPinnedNotes(userId: UUID, constellationIds: Set<UUID> = emptySet()): List<NoteResponse> {
        if (constellationIds.isEmpty()) return toResponses(userId) { noteRepository.findPinned(userId, PinLimit.MAX) }
        val ids = noteListStore.findPinned(userId, constellationIds, PinLimit.MAX)
        return toResponses(userId) { orderedById(ids) }
    }

    /**
     * Pins the owned note on top of the pinned list; a pinned note keeps its place. Any status may be pinned. Fails with
     * [PinLimitReachedException] when [PinLimit.MAX] notes are pinned already.
     */
    @Transactional
    fun pinNote(userId: UUID, noteId: UUID): NoteResponse {
        noteRepository.lockPins(userId)
        val pinned = noteRepository.pin(noteId, userId, PinLimit.MAX) > 0
        val note = noteRepository.getOwnedNote(userId, noteId)
        if (!pinned && note.pinnedAt == null) throw PinLimitReachedException("note")
        return getNote(userId, noteId)
    }

    /**
     * Sets the owned note's poster link and crop frames, replacing both: no [rawCrop] means the centred defaults. The
     * version and change time stay, so an open edit still saves.
     */
    @Transactional
    fun setPoster(userId: UUID, noteId: UUID, url: String, rawCrop: PosterCropRequest? = null): NoteResponse {
        val poster = PosterUrlNormalizer.normalize(url) ?: throw BadRequestException(PosterUrlNormalizer.RULE)
        val crop = rawCrop?.let { PosterCropValidator.validate(it) ?: throw BadRequestException(PosterCropValidator.RULE) }
        if (!notePosterStore.save(userId, noteId, poster, crop)) throw NotFoundException("note id=$noteId not found")
        return getNote(userId, noteId)
    }

    /** Removes the owned note's poster; removing a missing poster succeeds. */
    @Transactional
    fun removePoster(userId: UUID, noteId: UUID) {
        noteRepository.getOwnedNote(userId, noteId)
        notePosterStore.delete(noteId)
    }

    @Transactional
    fun unpinNote(userId: UUID, noteId: UUID) {
        if (noteRepository.unpin(noteId, userId) == 0) throw NotFoundException("note id=$noteId not found")
    }

    fun getNote(userId: UUID, noteId: UUID): NoteResponse {
        val pending = summaryRequestStore.hasPendingForNote(noteId)
        return noteRepository.getOwnedNote(userId, noteId).let { respond(it, isUpdating(it, pending)) }
    }

    /** Notes of the user's constellation itself (not of its sub-constellations), newest first. */
    fun getNotesInConstellation(userId: UUID, constellationId: UUID): List<NoteResponse> {
        if (!constellationRepository.existsByIdAndUserId(constellationId, userId)) {
            throw NotFoundException("constellation id=$constellationId not found")
        }
        return toResponses(userId) { noteRepository.findInConstellation(userId, constellationId) }
    }

    /** Notes with no constellation and no parent note, newest first. */
    fun getNotesWithoutConstellation(userId: UUID): List<NoteResponse> =
        toResponses(userId) { noteRepository.findWithoutConstellation(userId) }

    /** Notes linked to the chat, newest first. Callers pass an owned chat id. */
    fun getChatNotes(userId: UUID, chatId: UUID): List<NoteResponse> =
        toResponses(userId) { chatNoteRepository.findNotesByChatId(userId, chatId) }

    /** Ids of the chats the owned note was written from; empty for a hand-written note or once its chats are gone. */
    fun getLinkedChatIds(userId: UUID, noteId: UUID): List<UUID> {
        noteRepository.getOwnedNote(userId, noteId)
        return chatNoteRepository.findChatIdsByNoteId(userId, noteId)
    }

    /** Linked note counts keyed by chat id; chats without notes are absent. Callers pass owned chat ids only. */
    fun getNoteCounts(chatIds: Collection<UUID>): Map<UUID, Int> {
        if (chatIds.isEmpty()) return emptyMap()
        return chatNoteRepository.countNotesByChatIds(chatIds).associate { it.chatId to it.noteCount.toInt() }
    }

    /** Renames a READY note and reindexes it with its sub-notes, because their indexed text includes the title. */
    @Transactional
    fun renameNote(userId: UUID, noteId: UUID, rawTitle: String): NoteResponse {
        val title = TitleNormalizer.normalizeUserTitle(rawTitle)
            ?: throw BadRequestException(TitleNormalizer.USER_TITLE_RULE)
        val note = noteRepository.getOwnedNote(userId, noteId)
        if (note.status != NoteStatus.READY) throw NoteNotReadyException(noteId)
        // as an edit: a rename racing a summary update would make one of them fail its version check
        if (summaryRequestStore.hasPendingForNote(noteId)) throw NoteUpdatingException(noteId)
        note.title = title
        try {
            noteRepository.saveAndFlush(note)
        } catch (e: ObjectOptimisticLockingFailureException) {
            throw NoteVersionConflictException(noteId, e)
        }
        noteIndexRequestService.requestLaterWithSubNotes(userId, listOf(note.id))
        return respond(note, updating = false)
    }

    /**
     * Saves a user edit of a READY note made against [version] and reindexes it. An edit is refused while a summary
     * update is pending, because the update was drafted from the content the edit replaces; an unchanged edit is a
     * no-op that keeps the version. A null or blank [rawIcon] removes the icon.
     */
    @Transactional
    fun updateNote(
        userId: UUID,
        noteId: UUID,
        rawTitle: String,
        rawContent: String,
        version: Long,
        rawIcon: String? = null,
    ): NoteResponse {
        val (title, content, icon) = normalizeUserNote(rawTitle, rawContent, rawIcon)
        val note = noteRepository.getOwnedNote(userId, noteId)
        if (note.status != NoteStatus.READY) throw NoteNotReadyException(noteId)
        if (summaryRequestStore.hasPendingForNote(noteId)) throw NoteUpdatingException(noteId)
        if (note.version != version) throw NoteVersionConflictException(noteId)
        if (note.title == title && note.content == content && note.icon == icon) return respond(note, updating = false)
        val renamed = note.title != title
        note.title = title
        note.content = content
        note.icon = icon
        try {
            noteRepository.saveAndFlush(note)
        } catch (e: ObjectOptimisticLockingFailureException) {
            throw NoteVersionConflictException(noteId, e)
        }
        // sub-notes index their parents' titles
        if (renamed) {
            noteIndexRequestService.requestLaterWithSubNotes(userId, listOf(note.id))
        } else {
            noteIndexRequestService.requestLater(userId, listOf(note.id))
        }
        return respond(note, updating = false)
    }

    /**
     * Creates the user's hand-written READY note without a place and requests its index. A retry under the same
     * [idempotencyKey] returns that note; another body under it is an [IdempotencyKeyReusedException] naming the note.
     */
    @Transactional
    fun createNote(
        userId: UUID,
        idempotencyKey: UUID,
        rawTitle: String,
        rawContent: String,
        rawIcon: String?,
    ): NoteResponse {
        val (title, content, icon) = normalizeUserNote(rawTitle, rawContent, rawIcon)
        val fingerprint = ManualNoteFingerprint.of(title, content, icon)
        val inserted = noteRepository.insertManualNote(
            generateId(), userId, idempotencyKey, fingerprint.toByteArray(), title, content, icon,
        )
        if (inserted != null) {
            noteIndexRequestService.requestNow(userId, inserted.id)
            return respond(inserted, updating = false)
        }
        // a retry: the key already holds a note
        val stored = checkNotNull(noteRepository.findByUserIdAndIdempotencyKey(userId, idempotencyKey)) {
            "manual note under a conflicting key could not be loaded"
        }
        if (stored.requestFingerprint?.let(RequestFingerprint::from) != fingerprint) {
            throw IdempotencyKeyReusedException(mapOf("noteId" to stored.id.toString()))
        }
        return respond(stored, updating = false)
    }

    /** The user's title, content and icon under the note rules; a blank icon is none. Breaking a rule is a 400. */
    private fun normalizeUserNote(rawTitle: String, rawContent: String, rawIcon: String?): Triple<String, String, String?> {
        val title = TitleNormalizer.normalizeUserTitle(rawTitle)
            ?: throw BadRequestException(TitleNormalizer.USER_TITLE_RULE)
        val content = NoteContentNormalizer.normalizeUserContent(rawContent)
            ?: throw BadRequestException(NoteContentNormalizer.USER_CONTENT_RULE)
        val icon = rawIcon?.takeIf { it.isNotBlank() }
            ?.let { NoteIconNormalizer.normalize(it) ?: throw BadRequestException(NoteIconNormalizer.USER_ICON_RULE) }
        return Triple(title, content, icon)
    }

    /** Throws unless the user's note is READY without a pending summary update, as [updateNote] requires. */
    fun checkNoteEditable(userId: UUID, noteId: UUID) {
        val note = noteRepository.getOwnedNote(userId, noteId)
        if (note.status != NoteStatus.READY) throw NoteNotReadyException(noteId)
        if (summaryRequestStore.hasPendingForNote(noteId)) throw NoteUpdatingException(noteId)
    }

    /** The owned note's direct sub-notes, newest first. */
    fun getSubNotes(userId: UUID, noteId: UUID): List<NoteResponse> {
        noteRepository.getOwnedNote(userId, noteId)
        return toResponses(userId) { noteRepository.findByUserIdAndParentNoteIdOrderByCreatedAtDescIdDesc(userId, noteId) }
    }

    /** The notes of [ids] in that order; an id with no note left is skipped. */
    private fun orderedById(ids: List<UUID>): List<NoteEntity> {
        val notes = noteRepository.findAllById(ids).associateBy { it.id }
        return ids.mapNotNull { notes[it] }
    }

    /** One note with its poster; lists leave posters out. */
    private fun respond(note: NoteEntity, updating: Boolean): NoteResponse =
        note.toResponse(updating, notePosterStore.find(note.id))

    /** Pending requests are read before the notes, as in [isUpdating]. */
    private fun toResponses(userId: UUID, load: () -> List<NoteEntity>): List<NoteResponse> {
        val pendingNoteIds = summaryRequestStore.findPendingNoteIds(userId)
        return load().map { it.toResponse(it.status == NoteStatus.READY && it.id in pendingNoteIds) }
    }

    /**
     * Only a READY note can be updating: a GENERATING note's pending request is its creation. Callers read [pending]
     * before the note, so an update committing in between reads as updating, never as settled with stale content.
     */
    private fun isUpdating(note: NoteEntity, pending: Boolean): Boolean = note.status == NoteStatus.READY && pending


}
