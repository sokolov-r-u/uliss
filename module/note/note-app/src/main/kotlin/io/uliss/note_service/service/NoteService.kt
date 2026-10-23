package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.dto.response.NoteResponse
import io.uliss.note_service.dto.response.toResponse
import io.uliss.note_service.exception.NoteNotReadyException
import io.uliss.note_service.exception.NoteUpdatingException
import io.uliss.note_service.exception.NoteVersionConflictException
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ConstellationRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequestStore
import io.uliss.note_service.util.NoteContentNormalizer
import io.uliss.note_service.util.NoteIconNormalizer
import io.uliss.note_service.util.getOwnedNote
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
) {

    fun getNotes(userId: UUID): List<NoteResponse> =
        toResponses(userId) { noteRepository.findByUserIdOrderByCreatedAtDescIdDesc(userId) }

    fun getNote(userId: UUID, noteId: UUID): NoteResponse {
        val pending = summaryRequestStore.hasPendingForNote(noteId)
        return noteRepository.getOwnedNote(userId, noteId).let { it.toResponse(isUpdating(it, pending)) }
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
        return note.toResponse(updating = false)
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
        val title = TitleNormalizer.normalizeUserTitle(rawTitle)
            ?: throw BadRequestException(TitleNormalizer.USER_TITLE_RULE)
        val content = NoteContentNormalizer.normalizeUserContent(rawContent)
            ?: throw BadRequestException(NoteContentNormalizer.USER_CONTENT_RULE)
        val icon = rawIcon?.takeIf { it.isNotBlank() }
            ?.let { NoteIconNormalizer.normalize(it) ?: throw BadRequestException(NoteIconNormalizer.USER_ICON_RULE) }
        val note = noteRepository.getOwnedNote(userId, noteId)
        if (note.status != NoteStatus.READY) throw NoteNotReadyException(noteId)
        if (summaryRequestStore.hasPendingForNote(noteId)) throw NoteUpdatingException(noteId)
        if (note.version != version) throw NoteVersionConflictException(noteId)
        if (note.title == title && note.content == content && note.icon == icon) return note.toResponse(updating = false)
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
        return note.toResponse(updating = false)
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
