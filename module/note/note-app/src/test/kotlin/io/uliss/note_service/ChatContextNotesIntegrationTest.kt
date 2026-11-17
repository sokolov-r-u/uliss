package io.uliss.note_service

import io.uliss.note_service.dto.internal.ChatContext
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.dto.internal.ChatContextNote
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.service.NoteSummaryService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ChatContextNotesIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var noteSummaryService: NoteSummaryService

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Test
    fun `the context holds the main note first, then the ready branches oldest first, with the chat's boundary`() {
        val chat = chatRepository.save(ChatEntity(UUID.randomUUID(), "Context"))
        val first = message(chat, "first")
        val second = message(chat, "second")
        val olderBranch = linkNote(chat, NoteStatus.READY, "Album", "album body", first.id)
        val main = linkNote(chat, NoteStatus.READY, "Bowie", "main body", second.id, main = true)
        linkNote(chat, NoteStatus.GENERATING, null, null, null)
        linkNote(chat, NoteStatus.FAILED, null, null, null)
        val newerBranch = linkNote(chat, NoteStatus.READY, null, "tour body", second.id)

        val context = noteSummaryService.findChatContext(chat.id)

        assertEquals(
            ChatContext(
                second.id,
                listOf(
                    ChatContextNote(main.id, "Bowie", "main body", true),
                    ChatContextNote(olderBranch.id, "Album", "album body", false),
                    ChatContextNote(newerBranch.id, null, "tour body", false),
                ),
            ),
            context,
        )
    }

    @Test
    fun `notes without text stay out, and a chat whose notes all lack text has no context`() {
        val chat = chatRepository.save(ChatEntity(UUID.randomUUID(), "Blank"))
        val first = message(chat, "first")
        val main = linkNote(chat, NoteStatus.READY, "Main", "  \n", first.id, main = true)
        val branch = linkNote(chat, NoteStatus.READY, "Branch", "branch body", first.id)
        linkNote(chat, NoteStatus.READY, "Empty branch", null, first.id)

        assertEquals(
            ChatContext(first.id, listOf(ChatContextNote(branch.id, "Branch", "branch body", false))),
            noteSummaryService.findChatContext(chat.id),
        )

        noteRepository.deleteById(branch.id)
        assertNull(noteSummaryService.findChatContext(chat.id))
        assertEquals(main.id, noteSummaryService.findCurrentChatSummary(chat.id)?.noteId)
    }

    @Test
    fun `a chat has no context without a ready main note with a boundary`() {
        val noNotes = chatRepository.save(ChatEntity(UUID.randomUUID(), "No notes"))
        message(noNotes, "only")
        val legacy = chatRepository.save(ChatEntity(UUID.randomUUID(), "Legacy"))
        linkNote(legacy, NoteStatus.READY, "Main", "main body", null, main = true)
        val writing = chatRepository.save(ChatEntity(UUID.randomUUID(), "Writing"))
        linkNote(writing, NoteStatus.GENERATING, null, null, null, main = true)
        linkNote(writing, NoteStatus.READY, "Branch", "branch body", message(writing, "first").id)

        assertNull(noteSummaryService.findChatContext(noNotes.id))
        assertNull(noteSummaryService.findChatContext(legacy.id))
        assertNull(noteSummaryService.findChatContext(writing.id))
    }

    @Test
    fun `the chat's note ids cover its notes in every status and no other chat's`() {
        val chat = chatRepository.save(ChatEntity(UUID.randomUUID(), "Ids"))
        val main = linkNote(chat, NoteStatus.READY, "Main", "main body", message(chat, "first").id, main = true)
        val writing = linkNote(chat, NoteStatus.GENERATING, null, null, null)
        val failed = linkNote(chat, NoteStatus.FAILED, null, null, null)
        val other = chatRepository.save(ChatEntity(chat.userId, "Other"))
        linkNote(other, NoteStatus.READY, "Other", "other body", null, main = true)

        assertEquals(setOf(main.id, writing.id, failed.id), noteSummaryService.findChatNoteIds(chat.id))
    }

    private fun message(chat: ChatEntity, content: String): ChatMessageEntity = chatMessageRepository.save(
        ChatMessageEntity(chat.id, ChatMessageRole.USER, content, ChatMessageStatus.COMPLETE),
    )

    private fun linkNote(
        chat: ChatEntity,
        status: NoteStatus,
        title: String?,
        content: String?,
        throughMessageId: UUID?,
        main: Boolean = false,
    ): NoteEntity {
        val note = noteRepository.save(NoteEntity(chat.userId, content, NoteSource.CHAT_SUMMARY, status, title))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), chat.userId, throughMessageId, main))
        return note
    }
}
