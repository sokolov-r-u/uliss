package io.uliss.note_service.service.facade

import dev.openfeature.sdk.Client
import dev.openfeature.sdk.ImmutableContext
import io.uliss.exception.common.NotFoundException
import io.uliss.featureflags.FeatureFlagKeys
import io.uliss.note_service.dto.internal.ChatWithNoteCount
import io.uliss.note_service.dto.response.NoteResponse
import io.uliss.note_service.exception.NoteNotReadyException
import io.uliss.note_service.exception.NoteNotResummarizableException
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteService
import io.uliss.note_service.service.NoteSummaryService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class NoteFacade(
    private val noteService: NoteService,
    private val chatService: ChatService,
    private val noteSummaryService: NoteSummaryService,
    private val featureFlags: Client,
) {

    /** The chats an owned note was written from, by last activity, with their note counts. */
    fun getNoteChats(userId: UUID, noteId: UUID): List<ChatWithNoteCount> {
        val chats = chatService.getChatsByIds(userId, noteService.getLinkedChatIds(userId, noteId))
        val counts = noteService.getNoteCounts(chats.map { it.id })
        return chats.map { ChatWithNoteCount(it, counts[it.id] ?: 0) }
    }

    /**
     * Queues a rewrite of a summary note from its whole chat; the note shows as updating until it is applied. The
     * flag is checked before anything else, a replay included: with the flag off the endpoint does not exist.
     */
    @Transactional
    fun resummarize(userId: UUID, noteId: UUID, idempotencyKey: UUID): NoteResponse {
        val flagContext = ImmutableContext(userId.toString())
        if (!featureFlags.getBooleanValue(FeatureFlagKeys.NOTE_RESUMMARIZE, false, flagContext)) {
            throw NotFoundException("resummarize is not available")
        }
        noteSummaryService.findResummarizeReplay(userId, noteId, idempotencyKey)
            ?.let { return noteService.getNote(userId, noteId) }
        val note = noteService.getNote(userId, noteId)
        if (note.source != NoteSource.CHAT_SUMMARY) throw NoteNotResummarizableException(noteId)
        if (note.status != NoteStatus.READY) throw NoteNotReadyException(noteId)
        // a summary note is written from one chat; a deleted chat takes the link with it
        val chatId = noteService.getLinkedChatIds(userId, noteId).firstOrNull()
            ?: throw NoteNotResummarizableException(noteId)
        val latestMessageId = chatService.getLatestMessageId(userId, chatId)
            ?: throw NoteNotResummarizableException(noteId)
        noteSummaryService.requestResummarize(userId, chatId, noteId, latestMessageId, idempotencyKey)
        return noteService.getNote(userId, noteId)
    }
}
