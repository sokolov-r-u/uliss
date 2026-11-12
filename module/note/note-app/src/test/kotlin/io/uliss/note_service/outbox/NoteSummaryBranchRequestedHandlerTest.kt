package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.dto.internal.ChatSummaryContext
import io.uliss.note_service.dto.internal.NoteBodyDraft
import io.uliss.note_service.dto.internal.NoteDraft
import io.uliss.note_service.dto.internal.NotePlaceDescription
import io.uliss.note_service.exception.NonRetryableOutboxException
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.NoteSummaryBranchRequestedPayload
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteHierarchyService
import io.uliss.note_service.service.NoteSummaryService
import io.uliss.note_service.service.RagService
import io.uliss.note_service.service.UserProfileService
import io.uliss.note_service.service.handler.NoteSummaryBranchRequestedHandler
import io.uliss.note_service.service.handler.NoteSummaryProperties
import io.uliss.note_service.util.ChatPrompts
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class NoteSummaryBranchRequestedHandlerTest {

    private val objectMapper = JsonMapper.builder().build()
    private val chatClient = Mockito.mock(ChatClient::class.java)
    private val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
    private val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
    private val chatService = Mockito.mock(ChatService::class.java)
    private val ragService = Mockito.mock(RagService::class.java)
    private val noteService = Mockito.mock(NoteSummaryService::class.java)
    private val hierarchyService = Mockito.mock(NoteHierarchyService::class.java)
    private val profileService = Mockito.mock(UserProfileService::class.java)
    private val properties = NoteSummaryProperties(
        retrievalQueryMaxChars = 400,
        retrievalTopK = 3,
        retrievalMinSimilarity = 0.75,
        reasoningEffort = "medium",
        verbosity = "low",
    )
    private val handler = NoteSummaryBranchRequestedHandler(
        objectMapper, chatClient, chatService, ragService, noteService, hierarchyService, profileService, properties,
    )
    private val payload = NoteSummaryBranchRequestedPayload(
        noteId = UUID.randomUUID(),
        userId = UUID.randomUUID(),
        chatId = UUID.randomUUID(),
        mainNoteId = UUID.randomUUID(),
        afterMessageId = UUID.randomUUID(),
        throughMessageId = UUID.randomUUID(),
    )

    init {
        Mockito.`when`(noteService.findGeneratingNote(payload.userId, payload.noteId))
            .thenReturn(NoteEntity(payload.userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING))
        Mockito.`when`(noteService.findReadyNote(payload.userId, payload.mainNoteId)).thenReturn(
            NoteEntity(payload.userId, "Low is the best of the trilogy.", NoteSource.CHAT_SUMMARY, NoteStatus.READY, "Bowie"),
        )
        Mockito.`when`(hierarchyService.getPlaceDescription(anyValue(), anyValue()))
            .thenReturn(NotePlaceDescription(emptyList(), listOf("Bowie")))
        Mockito.`when`(
            chatService.getSummaryUpdateContext(
                payload.userId, payload.chatId, payload.afterMessageId, payload.throughMessageId,
            )
        ).thenReturn(
            ChatSummaryContext(
                "Bowie chat",
                listOf(ChatMessageEntity(payload.chatId, ChatMessageRole.USER, "Blackstar is a farewell", ChatMessageStatus.COMPLETE)),
            )
        )
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.entity(Mockito.eq(NoteDraft::class.java), anyValue()))
            .thenReturn(NoteDraft("Blackstar", "A farewell album.", null))
        Mockito.`when`(callResponseSpec.entity(Mockito.eq(NoteBodyDraft::class.java), anyValue()))
            .thenReturn(NoteBodyDraft("A farewell album.", emptyList()))
    }

    @Test
    fun `the model gets the messages after the boundary and the main note as already recorded`() {
        handler.handle(event())

        val userPrompt = promptArgument("user")
        assertTrue(userPrompt.contains("Blackstar is a farewell"))
        assertTrue(userPrompt.contains("EXISTING NOTE"))
        assertTrue(userPrompt.contains("Title: Bowie"))
        assertTrue(userPrompt.contains("Low is the best of the trilogy."))
        assertTrue(userPrompt.contains("Parent notes: \"Bowie\""))
        assertEquals(ChatPrompts.NOTE_BRANCH_SYSTEM_PROMPT, promptArgument("system"))
        // the main note is not offered back as a related note
        val search = Mockito.mockingDetails(ragService).invocations.single()
        assertEquals("searchExcluding", search.method.name)
        assertEquals(listOf(payload.userId, 3, 0.75, payload.mainNoteId), search.arguments.filterIndexed { i, _ -> i != 1 })
        Mockito.verify(noteService).completeChatSummary(payload.userId, payload.noteId, "Blackstar", "A farewell album.")
    }

    @Test
    fun `a branch the user named keeps the name and asks the model only for the body`() {
        Mockito.`when`(noteService.findGeneratingNote(payload.userId, payload.noteId)).thenReturn(
            NoteEntity(payload.userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING, "Last album"),
        )

        handler.handle(event())

        assertTrue(promptArgument("user").contains("Note title (set by the user): Last album"))
        Mockito.verify(callResponseSpec, Mockito.never()).entity(Mockito.eq(NoteDraft::class.java), anyValue())
        Mockito.verify(noteService).completeChatSummary(payload.userId, payload.noteId, "Last album", "A farewell album.")
    }

    @Test
    fun `a branch whose main note is gone is written from the messages alone`() {
        Mockito.`when`(noteService.findReadyNote(payload.userId, payload.mainNoteId)).thenReturn(null)

        handler.handle(event())

        val userPrompt = promptArgument("user")
        assertTrue("EXISTING NOTE" !in userPrompt)
        assertTrue(userPrompt.contains("Blackstar is a farewell"))
        Mockito.verify(noteService).completeChatSummary(payload.userId, payload.noteId, "Blackstar", "A farewell album.")
    }

    @Test
    fun `a branch that no longer waits for its text costs no model call`() {
        Mockito.`when`(noteService.findGeneratingNote(payload.userId, payload.noteId)).thenReturn(null)

        handler.handle(event())

        Mockito.verifyNoInteractions(chatClient)
    }

    @Test
    fun `a branch of a deleted chat is not retried`() {
        Mockito.`when`(
            chatService.getSummaryUpdateContext(
                payload.userId, payload.chatId, payload.afterMessageId, payload.throughMessageId,
            )
        ).thenThrow(NotFoundException("chat not found"))

        assertFailsWith<NonRetryableOutboxException> { handler.handle(event()) }
    }

    private fun promptArgument(method: String): String = Mockito.mockingDetails(requestSpec).invocations
        .single { it.method.name == method }
        .arguments[0] as String

    private fun event() = OutboxEventEntity(
        type = OutboxEventType.NOTE_SUMMARY_BRANCH_REQUESTED,
        payload = objectMapper.writeValueAsString(payload),
        status = OutboxEventStatus.PROCESSING,
        attempts = 0,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )
}
