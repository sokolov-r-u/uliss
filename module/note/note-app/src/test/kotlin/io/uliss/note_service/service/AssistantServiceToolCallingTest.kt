package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.captorFor
import io.uliss.note_service.captureValue
import io.uliss.note_service.dto.internal.AssistantActivity
import io.uliss.note_service.eqValue
import io.uliss.note_service.dto.internal.AssistantStreamEvent
import io.uliss.note_service.dto.internal.ChatTurnRequestResolution
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.projection.ChatTurn
import io.uliss.note_service.model.projection.ChatTurnStatus
import io.uliss.note_service.model.projection.RequestFingerprint
import io.uliss.note_service.repository.RetrievedChunk
import io.uliss.note_service.service.tool.NoteSearch
import io.uliss.note_service.service.tool.NotesSearchProperties
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.ToolResponseMessage
import org.springframework.ai.chat.model.ChatModel
import org.springframework.ai.chat.model.ChatResponse
import org.springframework.ai.chat.model.Generation
import org.springframework.ai.chat.prompt.ChatOptions
import org.springframework.ai.chat.prompt.Prompt
import org.springframework.ai.model.tool.ToolCallingChatOptions
import org.springframework.ai.openai.OpenAiChatOptions
import reactor.core.publisher.Flux
import reactor.test.StepVerifier
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Runs [AssistantService] through a real [ChatClient], so Spring AI's tool-calling loop invokes the notes search. */
class AssistantServiceToolCallingTest {

    /** Asks for one notes search, then answers with the tool result it got back; with [endless], never stops asking. */
    private class SearchingModel(private val endless: Boolean = false) : ChatModel {
        val prompts = mutableListOf<Prompt>()

        override fun call(prompt: Prompt): ChatResponse = error("the assistant streams")

        /** The ChatClient builds every request from these, as from the real OpenAI model's options. */
        override fun getOptions(): ChatOptions = OpenAiChatOptions.builder().build()

        override fun stream(prompt: Prompt): Flux<ChatResponse> {
            prompts += prompt
            val toolResponse = prompt.instructions.filterIsInstance<ToolResponseMessage>().lastOrNull()
            val message = if (toolResponse == null || endless) {
                AssistantMessage.builder()
                    .content("")
                    .toolCalls(
                        listOf(
                            AssistantMessage.ToolCall("call-1", "function", "searchNotes", """{"query":"music"}"""),
                        ),
                    )
                    .build()
            } else {
                AssistantMessage("Seen: " + toolResponse.responses.single().responseData)
            }
            return Flux.just(ChatResponse(listOf(Generation(message))))
        }
    }

    private val chatTurnService = Mockito.mock(ChatTurnService::class.java)
    private val model = SearchingModel()

    private fun assistantService(model: ChatModel) = AssistantService(
        ChatClient.builder(model).build(),
        chatTurnService,
        AssistantProperties(reasoningEffort = "low", verbosity = "low"),
        NotesSearchProperties(topK = 3, minSimilarity = 0.6, maxCallsPerTurn = 3),
    )

    private val userId = UUID.randomUUID()
    private val chatId = UUID.randomUUID()
    private val turnId = UUID.randomUUID()

    @Test
    fun `a model that keeps searching past the limit ends the turn instead of looping`() {
        val endless = SearchingModel(endless = true)
        val turn = startTurn()
        Mockito.`when`(
            chatTurnService.finishGenerationAttempt(
                eqValue(userId), eqValue(chatId), eqValue(turnId), eqValue(1),
                anyValue(), eqValue(ChatTurnStatus.FAILED),
            ),
        ).thenReturn(true)
        var searches = 0

        val events = assistantService(endless)
            .streamReply(userId, chatId, turnId, "What music do I like?") { _, _, _ -> searches++; emptyList() }
            .events

        StepVerifier.create(events.filter { it !is AssistantStreamEvent.Activity }).verifyError()
        assertEquals(3, searches)
        // Three searches, one refused call, one call that ends the loop.
        assertEquals(5, endless.prompts.size)
        Mockito.verify(chatTurnService, Mockito.times(3)).extendLease(turn)
    }

    private fun startTurn(): ChatTurn {
        val turn = ChatTurn(
            id = turnId,
            userId = userId,
            chatId = chatId,
            idempotencyKey = turnId,
            requestFingerprint = RequestFingerprint.from(ByteArray(32) { 1 }),
            status = ChatTurnStatus.GENERATING,
            attempt = 1,
            leaseUntil = Instant.now().plusSeconds(60),
            retryAfterMs = 60_000,
        )
        val history = listOf(
            ChatMessageEntity(chatId, ChatMessageRole.USER, "What music do I like?", ChatMessageStatus.COMPLETE, turnId),
        )
        Mockito.`when`(chatTurnService.resolveTurnRequest(userId, chatId, turnId, "What music do I like?"))
            .thenReturn(ChatTurnRequestResolution.StartGeneration(turn, history))
        Mockito.`when`(chatTurnService.extendLease(turn)).thenReturn(true)
        return turn
    }

    @Test
    fun `the model's notes search runs through the tool loop and feeds the reply`() {
        startTurn()
        Mockito.`when`(
            chatTurnService.finishGenerationAttempt(
                eqValue(userId), eqValue(chatId), eqValue(turnId), eqValue(1),
                anyValue(), eqValue(ChatTurnStatus.COMPLETE),
            ),
        ).thenReturn(true)
        val searches = mutableListOf<Triple<String, Int, Double>>()
        val search = NoteSearch { query, limit, minSimilarity ->
            searches += Triple(query, limit, minSimilarity)
            listOf(RetrievedChunk(UUID.randomUUID(), 0, "Loves Satori.", 0.9, "Satori", Instant.EPOCH))
        }

        val events = assistantService(model).streamReply(userId, chatId, turnId, "What music do I like?", search).events

        StepVerifier.create(events)
            .expectNext(
                AssistantStreamEvent.Activity(AssistantActivity.SEARCHING_NOTES),
                AssistantStreamEvent.Activity(AssistantActivity.THINKING),
            )
            .assertNext { event ->
                val text = (event as AssistantStreamEvent.AppendText).text
                assertTrue(text.startsWith("Seen: "))
                assertTrue(text.contains("Loves Satori."))
            }
            .expectNext(AssistantStreamEvent.GenerationCompleted)
            .verifyComplete()

        assertEquals(listOf(Triple("music", 3, 0.6)), searches)
        assertEquals(2, model.prompts.size)
        model.prompts.forEach { prompt ->
            val options = prompt.options as ToolCallingChatOptions
            assertEquals(listOf("searchNotes"), options.toolCallbacks?.map { it.toolDefinition.name() })
            assertEquals(chatId.toString(), (prompt.options as OpenAiChatOptions).promptCacheKey)
        }
        val saved = captorFor<String>(String::class.java)
        Mockito.verify(chatTurnService).finishGenerationAttempt(
            eqValue(userId), eqValue(chatId), eqValue(turnId), eqValue(1),
            saved.captureValue(), eqValue(ChatTurnStatus.COMPLETE),
        )
        assertTrue(saved.value.startsWith("Seen: "))
    }
}
