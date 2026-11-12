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
import io.uliss.note_service.model.payload.NoteSummaryBranchRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.OutboxEventRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals

class SummaryBranchIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var outboxEventRepository: OutboxEventRepository

    private val userId = UUID.randomUUID()

    @Test
    fun `a branch request reserves a generating note under its parent and leaves the main note alone`() {
        val chat = summarizedChat()
        val tail = message(chat.id, "A new album")

        val branchId = noteIdOf(
            branch(chat.id, """{"mode":"BRANCH","targetNoteId":"${chat.mainId}","parentNoteId":"${chat.mainId}","title":"  Blackstar "}""")
                .andExpect {
                    status { isAccepted() }
                    jsonPath("$.status") { value("GENERATING") }
                },
        )

        assertNotEquals(chat.mainId, branchId)
        val branchNote = noteRepository.findById(branchId).orElseThrow()
        assertEquals(NoteStatus.GENERATING, branchNote.status)
        assertEquals(NoteSource.CHAT_SUMMARY, branchNote.source)
        assertEquals("Blackstar", branchNote.title)
        assertEquals(chat.mainId, branchNote.parentNoteId)
        assertFalse(chatNoteRepository.findById(ChatNoteId(chat.id, branchId)).orElseThrow().main)
        // the main note and the chat's boundary move only when the branch is written
        val mainLink = chatNoteRepository.findById(ChatNoteId(chat.id, chat.mainId)).orElseThrow()
        assertEquals(chat.boundaryId, mainLink.summarizedThroughMessageId)
        assertEquals("main body", noteRepository.findById(chat.mainId).orElseThrow().content)
        assertEquals(
            NoteSummaryBranchRequestedPayload(branchId, userId, chat.id, chat.mainId, chat.boundaryId, tail),
            branchPayloads(chat.id).single(),
        )
        mockMvc.get("/note/chats/${chat.id}/notes") { auth() }.andExpect { jsonPath("$.length()") { value(2) } }
    }

    @Test
    fun `a branch request with a replayed key answers with the first note, still shown as generating`() {
        val chat = summarizedChat()
        message(chat.id, "A new album")
        val key = UUID.randomUUID()
        val body = """{"mode":"BRANCH","targetNoteId":"${chat.mainId}"}"""
        val branchId = noteIdOf(branch(chat.id, body, key).andExpect { status { isAccepted() } })
        val written = noteRepository.findById(branchId).orElseThrow()
        written.status = NoteStatus.READY
        written.content = "written"
        noteRepository.saveAndFlush(written)

        val replayed = branch(chat.id, """{"mode":"BRANCH","targetNoteId":"${chat.mainId}","title":"Other"}""", key)
            .andExpect {
                status { isAccepted() }
                jsonPath("$.status") { value("GENERATING") }
            }

        assertEquals(branchId, noteIdOf(replayed))
        assertEquals(1, branchPayloads(chat.id).size)
        assertEquals(null, noteRepository.findById(branchId).orElseThrow().title)
    }

    @Test
    fun `a second summary request of the chat waits for the branch`() {
        val chat = summarizedChat()
        message(chat.id, "A new album")
        val body = """{"mode":"BRANCH","targetNoteId":"${chat.mainId}"}"""
        branch(chat.id, body).andExpect { status { isAccepted() } }

        branch(chat.id, body).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("SUMMARY_IN_PROGRESS") }
        }
        branch(chat.id, """{"mode":"UPDATE","targetNoteId":"${chat.mainId}"}""").andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("SUMMARY_IN_PROGRESS") }
        }
    }

    @Test
    fun `a branch needs the chat's ready main note as its target`() {
        val chat = summarizedChat()
        message(chat.id, "A new album")
        val other = noteRepository.saveAndFlush(NoteEntity(userId, "body", title = "Other")).id

        branch(chat.id, """{"mode":"BRANCH","targetNoteId":"$other"}""").andExpect { status { isConflict() } }
        branch(chat.id, """{"mode":"BRANCH"}""").andExpect { status { isBadRequest() } }

        val unsummarized = chatRepository.save(ChatEntity(userId, "No note yet"))
        message(unsummarized.id, "first")
        branch(unsummarized.id, """{"mode":"BRANCH","targetNoteId":"$other"}""").andExpect { status { isConflict() } }
        assertEquals(0, branchPayloads(chat.id).size + branchPayloads(unsummarized.id).size)
    }

    @Test
    fun `a branch needs messages after the boundary and at most one place`() {
        val chat = summarizedChat()

        branch(chat.id, """{"mode":"BRANCH","targetNoteId":"${chat.mainId}"}""").andExpect { status { isBadRequest() } }

        message(chat.id, "A new album")
        branch(
            chat.id,
            """{"mode":"BRANCH","targetNoteId":"${chat.mainId}","parentNoteId":"${chat.mainId}","constellationId":"${UUID.randomUUID()}"}""",
        ).andExpect { status { isBadRequest() } }
        assertEquals(0, branchPayloads(chat.id).size)
    }

    @Test
    fun `a branch into a missing place is rolled back whole`() {
        val chat = summarizedChat()
        message(chat.id, "A new album")
        val notesBefore = noteRepository.count()

        branch(chat.id, """{"mode":"BRANCH","targetNoteId":"${chat.mainId}","parentNoteId":"${UUID.randomUUID()}"}""")
            .andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("PARENT_NOTE_NOT_FOUND") }
            }
        branch(chat.id, """{"mode":"BRANCH","targetNoteId":"${chat.mainId}","constellationId":"${UUID.randomUUID()}"}""")
            .andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("CONSTELLATION_NOT_FOUND") }
            }

        assertEquals(notesBefore, noteRepository.count())
        assertEquals(0, branchPayloads(chat.id).size)
        // nothing stays reserved: the next request is accepted
        branch(chat.id, """{"mode":"BRANCH","targetNoteId":"${chat.mainId}"}""").andExpect { status { isAccepted() } }
    }

    private class SummarizedChat(val id: UUID, val mainId: UUID, val boundaryId: UUID)

    /** A chat whose main note is READY and covers its only message. */
    private fun summarizedChat(): SummarizedChat {
        val chat = chatRepository.save(ChatEntity(userId, "Bowie"))
        val boundary = message(chat.id, "Low and Heroes")
        val main = noteRepository.saveAndFlush(
            NoteEntity(userId, "main body", NoteSource.CHAT_SUMMARY, NoteStatus.READY, "Bowie"),
        )
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, main.id), userId, boundary, main = true))
        return SummarizedChat(chat.id, main.id, boundary)
    }

    private fun message(chatId: UUID, content: String): UUID = chatMessageRepository.save(
        ChatMessageEntity(chatId, ChatMessageRole.USER, content, ChatMessageStatus.COMPLETE),
    ).id

    private fun branch(chatId: UUID, body: String, key: UUID = UUID.randomUUID()): ResultActionsDsl =
        mockMvc.post("/note/chats/$chatId/summarize") {
            auth()
            header("Idempotency-Key", key)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun noteIdOf(result: ResultActionsDsl): UUID =
        UUID.fromString(objectMapper.readTree(result.andReturn().response.contentAsString).get("noteId").asString())

    private fun branchPayloads(chatId: UUID): List<NoteSummaryBranchRequestedPayload> = outboxEventRepository.findAll()
        .filter { it.type == OutboxEventType.NOTE_SUMMARY_BRANCH_REQUESTED }
        .map { objectMapper.readValue(it.payload, NoteSummaryBranchRequestedPayload::class.java) }
        .filter { it.chatId == chatId }

    private fun MockHttpServletRequestDsl.auth() {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }
}
