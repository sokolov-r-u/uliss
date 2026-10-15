package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
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
import io.uliss.note_service.service.NoteService
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class ChatSummaryStateIntegrationTest {

    @Autowired
    lateinit var noteService: NoteService

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

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

        val current = noteService.findCurrentChatSummary(chat.id)

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

        noteService.deleteNote(userId, latest.id)

        assertEquals(older.id, noteService.findCurrentChatSummary(chat.id)?.noteId)
    }

    @Test
    fun `a chat without summary notes has no current summary`() {
        val chat = chatRepository.save(ChatEntity(UUID.randomUUID(), "Empty"))
        message(chat, "only")

        assertNull(noteService.findCurrentChatSummary(chat.id))
    }

    @Test
    fun `a legacy note without a boundary is current with a null boundary`() {
        val chat = chatRepository.save(ChatEntity(UUID.randomUUID(), "Legacy"))
        val legacy = linkNote(chat, NoteStatus.READY, null, null)

        val current = noteService.findCurrentChatSummary(chat.id)

        assertEquals(legacy.id, current?.noteId)
        assertNull(current?.throughMessageId)
    }

    @Test
    fun `deleting the boundary message keeps the note current with a null boundary`() {
        val chat = chatRepository.save(ChatEntity(UUID.randomUUID(), "Boundary deleted"))
        val boundary = message(chat, "boundary")
        val note = linkNote(chat, NoteStatus.READY, "Kept", boundary.id)

        chatMessageRepository.deleteById(boundary.id)

        val current = noteService.findCurrentChatSummary(chat.id)
        assertEquals(note.id, current?.noteId)
        assertNull(current?.throughMessageId)
    }

    private fun message(chat: ChatEntity, content: String): ChatMessageEntity = chatMessageRepository.save(
        ChatMessageEntity(chat.id, ChatMessageRole.USER, content, ChatMessageStatus.COMPLETE),
    )

    private fun linkNote(chat: ChatEntity, status: NoteStatus, title: String?, throughMessageId: UUID?): NoteEntity {
        val note = noteRepository.save(
            NoteEntity(chat.userId, if (status == NoteStatus.READY) "body" else null, NoteSource.CHAT_SUMMARY, status, title),
        )
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), throughMessageId))
        return note
    }
}
