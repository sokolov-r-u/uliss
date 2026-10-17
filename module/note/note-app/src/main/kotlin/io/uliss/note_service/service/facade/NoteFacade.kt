package io.uliss.note_service.service.facade

import io.uliss.note_service.dto.internal.ChatWithNoteCount
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteService
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class NoteFacade(
    private val noteService: NoteService,
    private val chatService: ChatService,
) {

    /** The chats an owned note was written from, by last activity, with their note counts. */
    fun getNoteChats(userId: UUID, noteId: UUID): List<ChatWithNoteCount> {
        val chats = chatService.getChatsByIds(userId, noteService.getLinkedChatIds(userId, noteId))
        val counts = noteService.getNoteCounts(chats.map { it.id })
        return chats.map { ChatWithNoteCount(it, counts[it.id] ?: 0) }
    }
}
