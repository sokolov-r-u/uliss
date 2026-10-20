package io.uliss.note_service

import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import org.hamcrest.Matchers.contains
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID

class ChatNoteLinksIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate


    @Test
    fun `a chat lists its notes newest first with their status`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Chat"))
        val older = link(chat, note(userId, NoteStatus.READY, "Older"), Duration.ofHours(2))
        val newer = link(chat, note(userId, NoteStatus.GENERATING, null), Duration.ofHours(1))
        note(userId, NoteStatus.READY, "Unlinked")

        mockMvc.get("/note/chats/${chat.id}/notes") { asUser(userId) }.andExpect {
            status { isOk() }
            jsonPath("$[*].id", contains(newer.id.toString(), older.id.toString()))
            jsonPath("$[0].status") { value("GENERATING") }
            jsonPath("$[1].title") { value("Older") }
        }
    }

    @Test
    fun `a note lists the chats it was written from by last activity`() {
        val userId = UUID.randomUUID()
        val note = note(userId, NoteStatus.READY, "Note")
        val quiet = chatRepository.save(ChatEntity(userId, "Quiet"))
        val active = chatRepository.save(ChatEntity(userId, "Active"))
        link(quiet, note, Duration.ZERO)
        link(active, note, Duration.ZERO)
        setActivity(quiet, Duration.ofHours(2))
        setActivity(active, Duration.ofHours(1))
        chatRepository.save(ChatEntity(userId, "Unlinked"))

        mockMvc.get("/note/notes/${note.id}/chats") { asUser(userId) }.andExpect {
            status { isOk() }
            jsonPath("$[*].id", contains(active.id.toString(), quiet.id.toString()))
            jsonPath("$[0].title") { value("Active") }
            jsonPath("$[0].noteCount") { value(1) }
        }
    }

    @Test
    fun `a hand-written note has no chats`() {
        val userId = UUID.randomUUID()
        val note = noteRepository.save(NoteEntity(userId, "body", NoteSource.MANUAL, NoteStatus.READY))

        mockMvc.get("/note/notes/${note.id}/chats") { asUser(userId) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }
    }

    @Test
    fun `deleting a chat removes it from its note's chats, deleting a note removes it from the chat's notes`() {
        val userId = UUID.randomUUID()
        val kept = chatRepository.save(ChatEntity(userId, "Kept"))
        val deleted = chatRepository.save(ChatEntity(userId, "Deleted"))
        val shared = note(userId, NoteStatus.READY, "Shared")
        val removed = note(userId, NoteStatus.READY, "Removed")
        link(kept, shared, Duration.ofHours(2))
        link(deleted, shared, Duration.ZERO)
        link(kept, removed, Duration.ofHours(1))

        mockMvc.delete("/note/chats/${deleted.id}") { asUser(userId) }.andExpect { status { isNoContent() } }
        mockMvc.delete("/note/notes/${removed.id}") { asUser(userId) }.andExpect { status { isNoContent() } }

        mockMvc.get("/note/notes/${shared.id}/chats") { asUser(userId) }.andExpect {
            jsonPath("$[*].id", contains(kept.id.toString()))
        }
        mockMvc.get("/note/chats/${kept.id}/notes") { asUser(userId) }.andExpect {
            jsonPath("$[*].id", contains(shared.id.toString()))
        }
    }

    @Test
    fun `foreign or missing chats and notes are not found`() {
        val owner = UUID.randomUUID()
        val stranger = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(owner, "Private"))
        val note = link(chat, note(owner, NoteStatus.READY, "Private"), Duration.ZERO)

        mockMvc.get("/note/chats/${chat.id}/notes") { asUser(stranger) }.andExpect { status { isNotFound() } }
        mockMvc.get("/note/notes/${note.id}/chats") { asUser(stranger) }.andExpect { status { isNotFound() } }
        mockMvc.get("/note/chats/${UUID.randomUUID()}/notes") { asUser(owner) }.andExpect { status { isNotFound() } }
        mockMvc.get("/note/notes/${UUID.randomUUID()}/chats") { asUser(owner) }.andExpect { status { isNotFound() } }
    }

    private fun note(userId: UUID, status: NoteStatus, title: String?): NoteEntity =
        noteRepository.save(NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, status).also { it.title = title })

    /** Links [note] to [chat] and dates the note [age] ago, so ordering does not depend on save timing. */
    private fun link(chat: ChatEntity, note: NoteEntity, age: Duration): NoteEntity {
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id)))
        jdbcTemplate.update(
            "UPDATE note.notes SET created_at = ? WHERE id = ?",
            Timestamp.from(Instant.now().minus(age)),
            note.id,
        )
        return note
    }

    private fun setActivity(chat: ChatEntity, age: Duration) {
        jdbcTemplate.update(
            "UPDATE note.chat SET updated_at = ? WHERE id = ?",
            Timestamp.from(Instant.now().minus(age)),
            chat.id,
        )
    }

    private fun MockHttpServletRequestDsl.asUser(userId: UUID) {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }
}
