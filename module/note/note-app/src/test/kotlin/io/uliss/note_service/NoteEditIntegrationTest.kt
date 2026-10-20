package io.uliss.note_service

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
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.put
import java.time.LocalDate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NoteEditIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var noteService: NoteService

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate


    @Test
    fun `saving an edit stores it, bumps the version and requests reindexing`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId)
        val version = noteRepository.findById(note.id).orElseThrow().version

        put(userId, note.id, "Edited", "## Part\n\nnew body", version).andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Edited") }
            jsonPath("$.content") { value("## Part\n\nnew body") }
            jsonPath("$.version") { value(checkNotNull(version) + 1) }
        }

        val stored = noteRepository.findById(note.id).orElseThrow()
        assertEquals("Edited", stored.title)
        assertEquals("## Part\n\nnew body", stored.content)
        assertEquals(1, indexRequests(userId, note.id))
    }

    @Test
    fun `an edit made against an older version is refused and keeps the stored note`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId)
        val staleVersion = noteRepository.findById(note.id).orElseThrow().version
        put(userId, note.id, "First", "first edit", staleVersion).andExpect { status { isOk() } }

        put(userId, note.id, "Second", "second edit", staleVersion).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("NOTE_VERSION_CONFLICT") }
        }

        assertEquals("first edit", noteRepository.findById(note.id).orElseThrow().content)
    }

    @Test
    fun `a foreign note is indistinguishable from a missing one`() {
        val note = readyNote(UUID.randomUUID())

        put(UUID.randomUUID(), note.id, "Mine", "stolen", 0).andExpect { status { isNotFound() } }

        assertEquals("body", noteRepository.findById(note.id).orElseThrow().content)
    }

    @Test
    fun `an edit is refused while a summary update of the note is pending`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Chat"))
        val covered = message(chat, "covered")
        val note = readyNote(userId)
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), covered.id))
        val through = message(chat, "new")
        noteService.requestChatSummaryUpdate(userId, chat.id, note.id, covered.id, through.id, UUID.randomUUID())
        val version = noteRepository.findById(note.id).orElseThrow().version

        put(userId, note.id, "Title", "edited", version).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("NOTE_UPDATING") }
        }
    }

    @Test
    fun `a later summary update appends to the edited content`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Chat"))
        val covered = message(chat, "covered")
        val note = readyNote(userId)
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), covered.id))
        val version = noteRepository.findById(note.id).orElseThrow().version
        put(userId, note.id, "Title", "edited by hand", version).andExpect { status { isOk() } }
        val through = message(chat, "new")
        val key = UUID.randomUUID()
        noteService.requestChatSummaryUpdate(userId, chat.id, note.id, covered.id, through.id, key)

        assertTrue(
            noteService.applyChatSummaryUpdate(
                userId, key, note.id, chat.id, covered.id, through.id, "Added.", LocalDate.of(2026, 10, 17),
            ),
        )

        assertEquals(
            "edited by hand\n\n---\n\n## 2026-10-17\n\nAdded.",
            noteRepository.findById(note.id).orElseThrow().content,
        )
    }

    private fun put(userId: UUID, noteId: UUID, title: String, content: String, version: Long?): ResultActionsDsl =
        mockMvc.put("/note/notes/$noteId") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            this.content = """{"title":"$title","content":${jsonString(content)},"version":$version}"""
        }

    private fun jsonString(value: String): String = "\"" + value.replace("\n", "\\n") + "\""

    private fun readyNote(userId: UUID): NoteEntity =
        noteRepository.save(NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY, "Title"))

    private fun message(chat: ChatEntity, content: String): ChatMessageEntity = chatMessageRepository.save(
        ChatMessageEntity(chat.id, ChatMessageRole.USER, content, ChatMessageStatus.COMPLETE),
    )

    private fun indexRequests(userId: UUID, noteId: UUID): Int = jdbcTemplate.queryForObject(
        """
            SELECT COUNT(*)
            FROM note.outbox_event
            WHERE type = 'NOTE_INDEX_REQUESTED'
              AND payload ->> 'userId' = ?
              AND payload ->> 'noteId' = ?
        """.trimIndent(),
        Int::class.java,
        userId.toString(),
        noteId.toString(),
    ) ?: 0
}
