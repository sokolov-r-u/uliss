package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.captorFor
import io.uliss.note_service.captureValue
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.prompt.ChatPrompts
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.Message
import org.springframework.ai.chat.messages.UserMessage
import reactor.core.publisher.Flux
import reactor.test.StepVerifier
import java.time.Duration
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class AssistantServiceTest {

    private val chatClient = Mockito.mock(ChatClient::class.java)
    private val chatService = Mockito.mock(ChatService::class.java)
    private val assistantService = AssistantService(chatClient, chatService)

    private val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)

    private fun history(chatId: UUID) = listOf(
        ChatMessageEntity(chatId, ChatMessageRole.USER, "hi", ChatMessageStatus.COMPLETE),
        ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "hello", ChatMessageStatus.COMPLETE),
    )

    private fun mockRequestChain() {
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(ChatPrompts.CHAT_SYSTEM_PROMPT)).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.messages(anyValue<List<Message>>())).thenReturn(requestSpec)
    }

    @Test
    fun `reply persists a COMPLETE message with the DeepSeek content and sends the full history`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
        mockRequestChain()
        Mockito.`when`(chatService.appendUserMessage(userId, chatId, "hi")).thenReturn(history(chatId))
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.content()).thenReturn("42")
        Mockito.`when`(chatService.persistAssistantReply(chatId, "42", ChatMessageStatus.COMPLETE))
            .thenReturn(ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "42", ChatMessageStatus.COMPLETE))

        assistantService.reply(userId, chatId, "hi")

        val captor = captorFor<List<Message>>(List::class.java)
        Mockito.verify(requestSpec).messages(captor.captureValue())
        val sent = captor.value
        assertEquals(2, sent.size)
        assertEquals("hi", (sent[0] as UserMessage).text)
        assertEquals("hello", (sent[1] as AssistantMessage).text)
        Mockito.verify(chatService).appendUserMessage(userId, chatId, "hi")
        Mockito.verify(chatService).persistAssistantReply(chatId, "42", ChatMessageStatus.COMPLETE)
    }

    @Test
    fun `reply persists a FAILED message and rethrows when the call fails`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        mockRequestChain()
        Mockito.`when`(chatService.appendUserMessage(userId, chatId, "hi")).thenReturn(history(chatId))
        Mockito.`when`(requestSpec.call()).thenThrow(RuntimeException("boom"))

        assertFailsWith<RuntimeException> {
            assistantService.reply(userId, chatId, "hi")
        }
        Mockito.verify(chatService).persistAssistantReply(chatId, "", ChatMessageStatus.FAILED)
    }

    @Test
    fun `streamReply emits tokens and persists COMPLETE on normal completion`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        mockRequestChain()
        Mockito.`when`(chatService.appendUserMessage(userId, chatId, "hi")).thenReturn(history(chatId))
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.content()).thenReturn(Flux.just("Hel", "lo"))

        val flux = assistantService.streamReply(userId, chatId, "hi")

        StepVerifier.create(flux)
            .expectNext("Hel", "lo")
            .verifyComplete()
        Mockito.verify(chatService).appendUserMessage(userId, chatId, "hi")
        Mockito.verify(chatService, Mockito.timeout(1000))
            .persistAssistantReply(chatId, "Hello", ChatMessageStatus.COMPLETE)
    }

    @Test
    fun `streamReply persists PARTIAL when the stream fails after emitting some content`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        mockRequestChain()
        Mockito.`when`(chatService.appendUserMessage(userId, chatId, "hi")).thenReturn(history(chatId))
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.content())
            .thenReturn(Flux.concat(Flux.just("Hi"), Flux.error(RuntimeException("boom"))))

        val flux = assistantService.streamReply(userId, chatId, "hi")

        StepVerifier.create(flux)
            .expectNext("Hi")
            .expectError(RuntimeException::class.java)
            .verify(Duration.ofSeconds(1))
        Mockito.verify(chatService, Mockito.timeout(1000))
            .persistAssistantReply(chatId, "Hi", ChatMessageStatus.PARTIAL)
    }

    @Test
    fun `streamReply persists FAILED when the stream fails before emitting anything`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        mockRequestChain()
        Mockito.`when`(chatService.appendUserMessage(userId, chatId, "hi")).thenReturn(history(chatId))
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.content()).thenReturn(Flux.error(RuntimeException("boom")))

        val flux = assistantService.streamReply(userId, chatId, "hi")

        StepVerifier.create(flux)
            .expectError(RuntimeException::class.java)
            .verify(Duration.ofSeconds(1))
        Mockito.verify(chatService, Mockito.timeout(1000))
            .persistAssistantReply(chatId, "", ChatMessageStatus.FAILED)
    }
}
