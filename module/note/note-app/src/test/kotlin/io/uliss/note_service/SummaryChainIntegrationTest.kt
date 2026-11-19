package io.uliss.note_service

import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.dto.internal.SummaryChunk
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.payload.NoteSummaryBranchRequestedPayload
import io.uliss.note_service.model.payload.NoteSummaryRequestedPayload
import io.uliss.note_service.model.payload.NoteSummaryUpdateRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.OutboxEventRepository
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteSummaryService
import io.uliss.note_service.service.handler.NoteSummaryUpdateTerminalFailureHandler
import io.uliss.note_service.util.SummaryChainStep
import io.uliss.note_service.util.NoteContentNormalizer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import tools.jackson.databind.ObjectMapper
import java.time.LocalDate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The same small limits as [ChatTailLimitIntegrationTest] (one Spring context): one Summarize call reads 200 chars. */
@TestPropertySource(
    properties = [
        "note.assistant.tail.soft-chars=100",
        "note.assistant.tail.hard-chars=150",
        "note.assistant.tail.summary-input-chars=200",
    ],
)
class SummaryChainIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var outboxEventRepository: OutboxEventRepository

    @Autowired
    lateinit var noteSummaryService: NoteSummaryService

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Autowired
    lateinit var chatService: ChatService

    @Autowired
    lateinit var updateFailureHandler: NoteSummaryUpdateTerminalFailureHandler

    private val userId = UUID.randomUUID()

    private companion object {
        const val LIMIT = 200
    }

    @Test
    fun `a first summary of a chat longer than one call asks only for the first chunk and keeps the latest message as its target`() {
        val chat = chatRepository.save(ChatEntity(userId, "Long"))
        val messages = (1..6).map { message(chat, 80) }

        summarize(chat.id, """{"mode":"CREATE"}""").andExpect { status { isAccepted() } }

        val payload = payloads<NoteSummaryRequestedPayload>(OutboxEventType.NOTE_SUMMARY_REQUESTED, chat.id).single()
        assertEquals(messages[1].id, payload.throughMessageId)
        assertEquals(messages.last().id, payload.targetMessageId)
    }

    @Test
    fun `a written chunk queues an update of the next chunk in the same transaction`() {
        val chat = chatRepository.save(ChatEntity(userId, "Chain"))
        val messages = (1..6).map { message(chat, 80) }
        val noteId = noteIdOf(summarize(chat.id, """{"mode":"CREATE"}"""))

        assertTrue(
            noteSummaryService.completeChatSummary(
                userId, noteId, "Long", "first chunk", SummaryChunk(messages[3].id, messages.last().id),
            ),
        )

        val next = payloads<NoteSummaryUpdateRequestedPayload>(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, chat.id).single()
        assertEquals(noteId, next.noteId)
        assertEquals(messages[1].id, next.afterMessageId)
        assertEquals(messages[3].id, next.throughMessageId)
        assertEquals(messages.last().id, next.targetMessageId)
        assertEquals(messages[1].id, noteSummaryService.findCurrentChatSummary(chat.id)?.throughMessageId)
        assertTrue(noteSummaryService.hasPendingSummary(chat.id))
    }

    @Test
    fun `an update of a long tail goes chunk by chunk, also past nothing new, and a redelivered step queues nothing`() {
        val chat = chatRepository.save(ChatEntity(userId, "Update"))
        val boundary = message(chat, 10)
        val main = mainNote(chat, boundary.id)
        val messages = (1..6).map { message(chat, 80) }

        summarize(chat.id, """{"mode":"UPDATE","targetNoteId":"$main"}""").andExpect { status { isAccepted() } }
        val first = payloads<NoteSummaryUpdateRequestedPayload>(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, chat.id).single()
        assertEquals(boundary.id, first.afterMessageId)
        assertEquals(messages[1].id, first.throughMessageId)
        assertEquals(messages.last().id, first.targetMessageId)

        val next = SummaryChunk(messages[3].id, messages.last().id)
        assertTrue(apply(first, null, next))
        assertFalse(apply(first, "again", next))

        val second = payloads<NoteSummaryUpdateRequestedPayload>(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, chat.id)
            .single { it.idempotencyKey != first.idempotencyKey }
        assertEquals(messages[1].id, second.afterMessageId)
        assertEquals(messages[3].id, second.throughMessageId)
        assertTrue(apply(second, "second chunk", null))
        assertEquals(messages[3].id, noteSummaryService.findCurrentChatSummary(chat.id)?.throughMessageId)
        assertTrue(noteRepository.findById(main).orElseThrow().content.orEmpty().endsWith("second chunk"))
        assertFalse(noteSummaryService.hasPendingSummary(chat.id))
    }

    @Test
    fun `a branch of a long tail is written chunk by chunk and every step moves the chat's boundary too`() {
        val chat = chatRepository.save(ChatEntity(userId, "Branch"))
        val boundary = message(chat, 10)
        val main = mainNote(chat, boundary.id)
        val messages = (1..6).map { message(chat, 80) }

        val branchId = noteIdOf(summarize(chat.id, """{"mode":"BRANCH","targetNoteId":"$main"}"""))
        val first = payloads<NoteSummaryBranchRequestedPayload>(OutboxEventType.NOTE_SUMMARY_BRANCH_REQUESTED, chat.id).single()
        assertEquals(messages[1].id, first.throughMessageId)
        assertEquals(messages.last().id, first.targetMessageId)

        noteSummaryService.completeChatSummary(userId, branchId, "Branch", "first", SummaryChunk(messages[3].id, messages.last().id))
        val step = payloads<NoteSummaryUpdateRequestedPayload>(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, chat.id).single()
        assertEquals(branchId, step.noteId)
        assertTrue(apply(step, "second", null))

        assertEquals(messages[3].id, noteSummaryService.findCurrentChatSummary(chat.id)?.throughMessageId)
        assertEquals(messages[3].id, chatNoteRepository.findById(ChatNoteId(chat.id, branchId)).orElseThrow().summarizedThroughMessageId)
        assertEquals("main body", noteRepository.findById(main).orElseThrow().content)
    }

    @Test
    fun `a branch step whose chat boundary moved elsewhere fails and ends the chain`() {
        val chat = chatRepository.save(ChatEntity(userId, "Moved"))
        val boundary = message(chat, 10)
        val main = mainNote(chat, boundary.id)
        val messages = (1..6).map { message(chat, 80) }
        val branchId = noteIdOf(summarize(chat.id, """{"mode":"BRANCH","targetNoteId":"$main"}"""))
        noteSummaryService.completeChatSummary(userId, branchId, "Branch", "first", SummaryChunk(messages[3].id, messages.last().id))
        val step = payloads<NoteSummaryUpdateRequestedPayload>(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, chat.id).single()
        val mainLink = chatNoteRepository.findById(ChatNoteId(chat.id, main)).orElseThrow()
        mainLink.summarizedThroughMessageId = messages[4].id
        chatNoteRepository.save(mainLink)

        assertFalse(apply(step, "second", SummaryChunk(messages[5].id, messages.last().id)))

        assertEquals(messages[4].id, noteSummaryService.findCurrentChatSummary(chat.id)?.throughMessageId)
        assertFalse(noteSummaryService.hasPendingSummary(chat.id))
    }

    @Test
    fun `a chunk that does not fit the note limit fails and ends the chain, leaving the chat blocked`() {
        val chat = chatRepository.save(ChatEntity(userId, "Full"))
        val boundary = message(chat, 10)
        val main = mainNote(chat, boundary.id)
        val full = noteRepository.findById(main).orElseThrow()
        full.content = "n".repeat(NoteContentNormalizer.MAX_CHARS - 10)
        noteRepository.saveAndFlush(full)
        val messages = (1..6).map { message(chat, 80) }
        summarize(chat.id, """{"mode":"UPDATE","targetNoteId":"$main"}""").andExpect { status { isAccepted() } }
        val first = payloads<NoteSummaryUpdateRequestedPayload>(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, chat.id).single()

        assertFalse(apply(first, "a long addendum", SummaryChunk(messages[3].id, messages.last().id)))

        assertEquals(1, payloads<NoteSummaryUpdateRequestedPayload>(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, chat.id).size)
        assertEquals(boundary.id, noteSummaryService.findCurrentChatSummary(chat.id)?.throughMessageId)
        assertFalse(noteSummaryService.hasPendingSummary(chat.id))
    }

    @Test
    fun `every step of a chain reads at most one call's input and together they cover the tail through the target`() {
        val chat = chatRepository.save(ChatEntity(userId, "Coverage"))
        val boundary = message(chat, 10)
        val messages = (1..7).map { message(chat, 70) }
        val read = mutableListOf<UUID>()
        var after = boundary.id
        var chunk = SummaryChainStep.next(chatService, userId, chat.id, boundary.id, messages.last().id, LIMIT)

        while (chunk != null) {
            val input = chatService.getSummaryUpdateContext(userId, chat.id, after, chunk.throughMessageId).messages
            assertTrue(input.sumOf { it.content.length } <= LIMIT, "a step reads ${input.size} messages over the limit")
            read += input.map { it.id }
            after = chunk.throughMessageId
            chunk = SummaryChainStep.next(chatService, userId, chat.id, after, chunk.targetMessageId, LIMIT)
        }

        assertEquals(messages.map { it.id }, read)
    }

    @Test
    fun `a chain whose target a retry removed ends on the last message before it, and an old step without a target is one step`() {
        val chat = chatRepository.save(ChatEntity(userId, "Retried"))
        val messages = (1..5).map { message(chat, 80) }
        chatMessageRepository.delete(messages.last())

        assertEquals(
            SummaryChunk(messages[3].id, messages.last().id),
            SummaryChainStep.next(chatService, userId, chat.id, messages[1].id, messages.last().id, LIMIT),
        )
        assertEquals(null, SummaryChainStep.next(chatService, userId, chat.id, messages[3].id, messages.last().id, LIMIT))
        assertEquals(null, SummaryChainStep.next(chatService, userId, chat.id, messages[1].id, null, LIMIT))
    }

    @Test
    fun `a new Summarize while a chain step is pending is refused`() {
        val chat = chatRepository.save(ChatEntity(userId, "Busy"))
        val messages = (1..6).map { message(chat, 80) }
        val noteId = noteIdOf(summarize(chat.id, """{"mode":"CREATE"}"""))
        noteSummaryService.completeChatSummary(userId, noteId, "Busy", "first", SummaryChunk(messages[3].id, messages.last().id))

        summarize(chat.id, """{"mode":"UPDATE","targetNoteId":"$noteId"}""").andExpect { status { isConflict() } }
    }

    @Test
    fun `a redelivered first step queues no second chain step`() {
        val chat = chatRepository.save(ChatEntity(userId, "Redelivered"))
        val messages = (1..6).map { message(chat, 80) }
        val noteId = noteIdOf(summarize(chat.id, """{"mode":"CREATE"}"""))
        val next = SummaryChunk(messages[3].id, messages.last().id)

        assertTrue(noteSummaryService.completeChatSummary(userId, noteId, "Redelivered", "first", next))
        assertFalse(noteSummaryService.completeChatSummary(userId, noteId, "Redelivered", "again", next))

        assertEquals(1, payloads<NoteSummaryUpdateRequestedPayload>(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, chat.id).size)
    }

    @Test
    fun `a step failed mid-chain keeps the written chunks, and the next Summarize continues from the boundary`() {
        val chat = chatRepository.save(ChatEntity(userId, "Failed"))
        val boundary = message(chat, 10)
        val main = mainNote(chat, boundary.id)
        val messages = (1..6).map { message(chat, 80) }
        summarize(chat.id, """{"mode":"UPDATE","targetNoteId":"$main"}""").andExpect { status { isAccepted() } }
        val first = payloads<NoteSummaryUpdateRequestedPayload>(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, chat.id).single()
        assertTrue(apply(first, "first chunk", SummaryChunk(messages[3].id, messages.last().id)))
        val failed = outboxEventRepository.findAll().single {
            it.type == OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED && it.payload.contains(chat.id.toString()) &&
                !it.payload.contains(first.idempotencyKey.toString())
        }

        updateFailureHandler.handleTerminalFailure(failed)

        assertFalse(noteSummaryService.hasPendingSummary(chat.id))
        assertEquals(messages[1].id, noteSummaryService.findCurrentChatSummary(chat.id)?.throughMessageId)
        assertTrue(noteRepository.findById(main).orElseThrow().content.orEmpty().endsWith("first chunk"))
        summarize(chat.id, """{"mode":"UPDATE","targetNoteId":"$main"}""").andExpect { status { isAccepted() } }
        val resumed = payloads<NoteSummaryUpdateRequestedPayload>(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, chat.id)
            .single { it.afterMessageId == messages[1].id && it.idempotencyKey.toString() !in failed.payload }
        assertEquals(messages[3].id, resumed.throughMessageId)
    }

    @Test
    fun `messages written after the target stay the chat's tail once the chain reaches it`() {
        val chat = chatRepository.save(ChatEntity(userId, "After"))
        val boundary = message(chat, 10)
        val main = mainNote(chat, boundary.id)
        val messages = (1..2).map { message(chat, 80) }
        summarize(chat.id, """{"mode":"UPDATE","targetNoteId":"$main"}""").andExpect { status { isAccepted() } }
        val step = payloads<NoteSummaryUpdateRequestedPayload>(OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED, chat.id).single()
        message(chat, 30)

        // the whole tail fits one call: one step, no chain
        assertEquals(messages.last().id, step.throughMessageId)
        assertTrue(apply(step, "all of it", null))

        mockMvc.get("/note/chats/${chat.id}/messages") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { jsonPath("$.tail.chars") { value(30) } }
    }

    private fun apply(payload: NoteSummaryUpdateRequestedPayload, addendum: String?, next: SummaryChunk?): Boolean =
        noteSummaryService.applyChatSummaryUpdate(
            payload.userId, payload.idempotencyKey, payload.noteId, payload.chatId, payload.afterMessageId,
            payload.throughMessageId, addendum, LocalDate.of(2026, 11, 18), next,
        )

    private fun mainNote(chat: ChatEntity, throughMessageId: UUID): UUID {
        val note = noteRepository.saveAndFlush(NoteEntity(userId, "main body", NoteSource.CHAT_SUMMARY, NoteStatus.READY, "Main"))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), userId, throughMessageId, main = true))
        return note.id
    }

    private fun noteIdOf(result: ResultActionsDsl): UUID =
        UUID.fromString(objectMapper.readTree(result.andReturn().response.contentAsString).get("noteId").asString())

    private fun message(chat: ChatEntity, chars: Int): ChatMessageEntity = chatMessageRepository.save(
        ChatMessageEntity(chat.id, ChatMessageRole.USER, "m".repeat(chars), ChatMessageStatus.COMPLETE),
    )

    private fun summarize(chatId: UUID, body: String): ResultActionsDsl =
        mockMvc.post("/note/chats/$chatId/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", UUID.randomUUID())
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private inline fun <reified T : Any> payloads(type: OutboxEventType, chatId: UUID): List<T> =
        outboxEventRepository.findAll()
            .filter { it.type == type && it.payload.contains(chatId.toString()) }
            .map { objectMapper.readValue(it.payload, T::class.java) }
}
