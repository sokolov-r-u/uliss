package io.uliss.note_service

import io.uliss.note_service.service.NoteSummaryService
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteHierarchyService
import io.uliss.note_service.service.NoteService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.time.LocalDate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChatSummaryStateIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var noteService: NoteService

    @Autowired
    lateinit var noteSummaryService: NoteSummaryService

    @Autowired
    lateinit var noteHierarchyService: NoteHierarchyService

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Autowired
    lateinit var chatService: ChatService

    @Test
    fun `current summary is the latest ready chat summary note with its boundary`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "State"))
        val first = message(chat, "first")
        val second = message(chat, "second")
        linkNote(chat, NoteStatus.READY, "Older", first.id)
        val latest = linkNote(chat, NoteStatus.READY, "Latest", second.id)
        linkNote(chat, NoteStatus.GENERATING, null, null)
        linkNote(chat, NoteStatus.FAILED, null, null)

        val current = noteSummaryService.findCurrentChatSummary(chat.id)

        assertEquals(latest.id, current?.noteId)
        assertEquals("Latest", current?.noteTitle)
        assertEquals(second.id, current?.throughMessageId)
    }

    @Test
    fun `deleting the current note falls back to the previous ready note`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Fallback"))
        val first = message(chat, "first")
        val older = linkNote(chat, NoteStatus.READY, "Older", first.id)
        val latest = linkNote(chat, NoteStatus.READY, "Latest", message(chat, "second").id)

        noteHierarchyService.delete(userId, latest.id, null)

        assertEquals(older.id, noteSummaryService.findCurrentChatSummary(chat.id)?.noteId)
    }

    @Test
    fun `a chat without summary notes has no current summary`() {
        val chat = chatRepository.save(ChatEntity(UUID.randomUUID(), "Empty"))
        message(chat, "only")

        assertNull(noteSummaryService.findCurrentChatSummary(chat.id))
    }

    @Test
    fun `a legacy note without a boundary is current with a null boundary`() {
        val chat = chatRepository.save(ChatEntity(UUID.randomUUID(), "Legacy"))
        val legacy = linkNote(chat, NoteStatus.READY, null, null)

        val current = noteSummaryService.findCurrentChatSummary(chat.id)

        assertEquals(legacy.id, current?.noteId)
        assertNull(current?.throughMessageId)
    }

    @Test
    fun `deleting the boundary message keeps the note current with a null boundary`() {
        val chat = chatRepository.save(ChatEntity(UUID.randomUUID(), "Boundary deleted"))
        val boundary = message(chat, "boundary")
        val note = linkNote(chat, NoteStatus.READY, "Kept", boundary.id)

        chatMessageRepository.deleteById(boundary.id)

        val current = noteSummaryService.findCurrentChatSummary(chat.id)
        assertEquals(note.id, current?.noteId)
        assertNull(current?.throughMessageId)
    }

    @Test
    fun `update context holds only the messages after the boundary up to the request`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Range"))
        val covered = message(chat, "covered")
        val first = message(chat, "first new")
        val through = message(chat, "second new")
        message(chat, "sent while generating")

        val context = chatService.getSummaryUpdateContext(userId, chat.id, covered.id, through.id)

        assertEquals(listOf("first new", "second new"), context.messages.map { it.content })
        assertEquals(
            listOf("covered", "first new", "second new"),
            chatService.getSummaryUpdateContext(userId, chat.id, null, through.id).messages.map { it.content },
        )
    }

    @Test
    fun `applying an update appends once and moves the boundary to the request`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Apply"))
        val covered = message(chat, "covered")
        val note = linkNote(chat, NoteStatus.READY, "Title", covered.id)
        val through = message(chat, "new")
        val key = UUID.randomUUID()
        noteSummaryService.requestChatSummaryUpdate(userId, chat.id, note.id, covered.id, through.id, key)
        val day = LocalDate.of(2026, 10, 8)

        assertTrue(noteSummaryService.applyChatSummaryUpdate(userId, key, note.id, chat.id, covered.id, through.id, "Added.", day))
        assertFalse(noteSummaryService.applyChatSummaryUpdate(userId, key, note.id, chat.id, covered.id, through.id, "Again.", day))

        assertEquals("body\n\n---\n\n## 2026-10-08\n\nAdded.", noteRepository.findById(note.id).orElseThrow().content)
        assertEquals(through.id, noteSummaryService.findCurrentChatSummary(chat.id)?.throughMessageId)
    }

    private fun message(chat: ChatEntity, content: String): ChatMessageEntity = chatMessageRepository.save(
        ChatMessageEntity(chat.id, ChatMessageRole.USER, content, ChatMessageStatus.COMPLETE),
    )

    private fun linkNote(chat: ChatEntity, status: NoteStatus, title: String?, throughMessageId: UUID?): NoteEntity {
        val note = noteRepository.save(
            NoteEntity(chat.userId, if (status == NoteStatus.READY) "body" else null, NoteSource.CHAT_SUMMARY, status, title),
        )
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), chat.userId, throughMessageId))
        return note
    }
}
