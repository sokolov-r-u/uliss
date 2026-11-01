package io.uliss.note_service

import io.uliss.featureflags.FeatureFlagKeys
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.SummaryRequestStatus
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.OutboxEventRepository
import io.uliss.note_service.repository.SummaryRequestStore
import io.uliss.note_service.service.NoteSummaryService
import io.uliss.note_service.util.NoteContentNormalizer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NoteResummarizeIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var outboxEventRepository: OutboxEventRepository

    @Autowired
    lateinit var noteSummaryService: NoteSummaryService

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var summaryRequestStore: SummaryRequestStore

    private val userId = UUID.randomUUID()

    @Test
    fun `resummarize reserves the whole chat for the note and shows it as updating`() {
        featureFlags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, userId.toString())
        val (chat, note) = summarizedChat()
        val latest = message(chat, "Added after the summary")

        resummarize(note.id, UUID.randomUUID()).andExpect {
            status { isAccepted() }
            jsonPath("$.id") { value(note.id.toString()) }
            jsonPath("$.status") { value("READY") }
            jsonPath("$.title") { value("Trip") }
        }

        val event = outboxEventRepository.findAll().single {
            it.type == OutboxEventType.NOTE_RESUMMARIZE_REQUESTED && it.payload.contains(note.id.toString())
        }
        val payload = objectMapper.readTree(event.payload)
        assertEquals(chat.id.toString(), payload["chatId"].stringValue())
        assertEquals(latest.id.toString(), payload["throughMessageId"].stringValue())
        mockMvc.get("/note/notes/${note.id}") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            jsonPath("$.updating") { value(true) }
        }
    }

    @Test
    fun `resummarize is not found while the flag is off for the user`() {
        featureFlags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, UUID.randomUUID().toString())
        val (_, note) = summarizedChat()

        resummarize(note.id, UUID.randomUUID()).andExpect { status { isNotFound() } }

        assertEquals(0, pendingRequests(note.id))
    }

    @Test
    fun `a replayed key returns the same note and queues no second rewrite`() {
        featureFlags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, userId.toString())
        val (_, note) = summarizedChat()
        val key = UUID.randomUUID()

        resummarize(note.id, key).andExpect { status { isAccepted() } }
        resummarize(note.id, key).andExpect {
            status { isAccepted() }
            header { string("Idempotency-Key", key.toString()) }
            jsonPath("$.id") { value(note.id.toString()) }
        }

        assertEquals(1, resummarizeEvents(note.id))
    }

    @Test
    fun `a key used for another note is a conflict`() {
        featureFlags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, userId.toString())
        val (_, first) = summarizedChat()
        val (_, second) = summarizedChat()
        val key = UUID.randomUUID()
        resummarize(first.id, key).andExpect { status { isAccepted() } }

        resummarize(second.id, key).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
        }
        assertEquals(0, resummarizeEvents(second.id))
    }

    @Test
    fun `a chat with a summary request in progress is a conflict`() {
        featureFlags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, userId.toString())
        val (_, note) = summarizedChat()
        resummarize(note.id, UUID.randomUUID()).andExpect { status { isAccepted() } }

        resummarize(note.id, UUID.randomUUID()).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("SUMMARY_IN_PROGRESS") }
        }
        assertEquals(1, resummarizeEvents(note.id))
    }

    @Test
    fun `a hand-written note cannot be summarized again`() {
        featureFlags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, userId.toString())
        val note = noteRepository.save(NoteEntity(userId, "Mine", NoteSource.MANUAL, NoteStatus.READY, "Own"))

        resummarize(note.id, UUID.randomUUID()).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("NOTE_NOT_RESUMMARIZABLE") }
        }
    }

    @Test
    fun `a note whose chat was deleted cannot be summarized again`() {
        featureFlags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, userId.toString())
        val (chat, note) = summarizedChat()
        chatRepository.delete(chat)

        resummarize(note.id, UUID.randomUUID()).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("NOTE_NOT_RESUMMARIZABLE") }
        }
    }

    @Test
    fun `a failed summary note is not ready to be summarized again`() {
        featureFlags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, userId.toString())
        val chat = chatRepository.save(ChatEntity(userId, "Failed summary"))
        val first = message(chat, "Fly to Rome")
        val note = noteSummaryService.requestChatSummary(userId, chat.id, first.id, UUID.randomUUID())
        noteRepository.save(note.apply { status = NoteStatus.FAILED })
        summaryRequestStore.finishPendingForNote(note.id, SummaryRequestStatus.FAILED)

        resummarize(note.id, UUID.randomUUID()).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("NOTE_NOT_READY") }
        }
    }

    @Test
    fun `an applied rewrite replaces the text, moves the boundary and keeps the title and icon`() {
        featureFlags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, userId.toString())
        val (chat, note) = summarizedChat(icon = "🎷")
        val latest = message(chat, "Rather by train")
        val key = UUID.randomUUID()
        resummarize(note.id, key).andExpect { status { isAccepted() } }
        val indexedBefore = indexEvents(note.id)

        val applied = noteSummaryService.applyResummarize(userId, key, note.id, chat.id, latest.id, "By train to Rome.")

        assertTrue(applied)
        val saved = noteRepository.findById(note.id).orElseThrow()
        assertEquals("By train to Rome.", saved.content)
        assertEquals("Trip", saved.title)
        assertEquals("🎷", saved.icon)
        assertEquals(NoteStatus.READY, saved.status)
        assertEquals(SummaryRequestStatus.APPLIED, summaryRequestStore.find(userId, key)?.status)
        mockMvc.get("/note/chats/${chat.id}/messages") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            jsonPath("$.summary.throughMessageId") { value(latest.id.toString()) }
        }
        mockMvc.get("/note/notes/${note.id}") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { jsonPath("$.updating") { value(false) } }
        // indexed at once, not after the reindex delay
        assertEquals(indexedBefore + 1, indexEvents(note.id))
    }

    @Test
    fun `a rewrite past the editable limit keeps the old text and fails the request`() {
        featureFlags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, userId.toString())
        val (chat, note) = summarizedChat()
        val latest = message(chat, "Rather by train")
        val key = UUID.randomUUID()
        resummarize(note.id, key).andExpect { status { isAccepted() } }

        val tooLong = "a".repeat(NoteContentNormalizer.MAX_CHARS + 1)
        val applied = noteSummaryService.applyResummarize(userId, key, note.id, chat.id, latest.id, tooLong)

        assertFalse(applied)
        assertEquals("Fly to Rome.", noteRepository.findById(note.id).orElseThrow().content)
        assertEquals(SummaryRequestStatus.FAILED, summaryRequestStore.find(userId, key)?.status)
        assertEquals(0, pendingRequests(note.id))
    }

    @Test
    fun `a redelivered rewrite is applied once`() {
        featureFlags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, userId.toString())
        val (chat, note) = summarizedChat()
        val latest = message(chat, "Rather by train")
        val key = UUID.randomUUID()
        resummarize(note.id, key).andExpect { status { isAccepted() } }
        noteSummaryService.applyResummarize(userId, key, note.id, chat.id, latest.id, "First rewrite.")

        val again = noteSummaryService.applyResummarize(userId, key, note.id, chat.id, latest.id, "Second rewrite.")

        assertFalse(again)
        assertEquals("First rewrite.", noteRepository.findById(note.id).orElseThrow().content)
    }

    private fun indexEvents(noteId: UUID): Int = outboxEventRepository.findAll().count {
        it.type == OutboxEventType.NOTE_INDEX_REQUESTED && it.payload.contains(noteId.toString()) &&
            it.nextAttemptAt <= Instant.now()
    }

    private fun resummarizeEvents(noteId: UUID): Int = outboxEventRepository.findAll().count {
        it.type == OutboxEventType.NOTE_RESUMMARIZE_REQUESTED && it.payload.contains(noteId.toString())
    }

    private fun pendingRequests(noteId: UUID): Int? = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM note.summary_request WHERE note_id = ? AND status = 'PENDING'", Int::class.java, noteId,
    )

    private fun resummarize(noteId: UUID, key: UUID, user: UUID = userId): ResultActionsDsl =
        mockMvc.post("/note/notes/$noteId/resummarize") {
            with(jwt().jwt { it.claim("userId", user.toString()) })
            header("Idempotency-Key", key)
        }

    /** A chat with one message and its READY summary note covering it. */
    private fun summarizedChat(icon: String? = null): Pair<ChatEntity, NoteEntity> {
        val chat = chatRepository.save(ChatEntity(userId, "Resummarize test"))
        val first = message(chat, "Fly to Rome")
        val note = noteSummaryService.requestChatSummary(userId, chat.id, first.id, UUID.randomUUID(), title = "Trip", icon = icon)
        noteSummaryService.completeChatSummary(userId, note.id, null, "Fly to Rome.")
        return chat to note
    }

    private fun message(chat: ChatEntity, content: String): ChatMessageEntity =
        chatMessageRepository.save(ChatMessageEntity(chat.id, ChatMessageRole.USER, content, ChatMessageStatus.COMPLETE))
}
