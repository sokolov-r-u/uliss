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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

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
    fun `streamReply emits tokens but waits for COMPLETE persistence before completion`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        val persistenceStarted = CountDownLatch(1)
        val releasePersistence = CountDownLatch(1)
        mockRequestChain()
        Mockito.`when`(chatService.appendUserMessage(userId, chatId, "hi")).thenReturn(history(chatId))
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.content()).thenReturn(Flux.just("Hel", "lo"))
        Mockito.`when`(
            chatService.persistAssistantReply(chatId, "Hello", ChatMessageStatus.COMPLETE)
        ).thenAnswer {
            persistenceStarted.countDown()
            assertTrue(releasePersistence.await(1, TimeUnit.SECONDS))
            ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "Hello", ChatMessageStatus.COMPLETE)
        }

        val flux = assistantService.streamReply(userId, chatId, "hi")

        StepVerifier.create(flux)
            .expectNext("Hel", "lo")
            .then { assertTrue(persistenceStarted.await(1, TimeUnit.SECONDS)) }
            .expectNoEvent(Duration.ofMillis(100))
            .then(releasePersistence::countDown)
            .verifyComplete()
        Mockito.verify(chatService).appendUserMessage(userId, chatId, "hi")
        Mockito.verify(chatService).persistAssistantReply(chatId, "Hello", ChatMessageStatus.COMPLETE)
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
        Mockito.verify(chatService).persistAssistantReply(chatId, "Hi", ChatMessageStatus.PARTIAL)
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
        Mockito.verify(chatService).persistAssistantReply(chatId, "", ChatMessageStatus.FAILED)
    }

    @Test
    fun `streamReply propagates persistence failure instead of completing`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        mockRequestChain()
        Mockito.`when`(chatService.appendUserMessage(userId, chatId, "hi")).thenReturn(history(chatId))
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.content()).thenReturn(Flux.just("Hello"))
        Mockito.`when`(
            chatService.persistAssistantReply(chatId, "Hello", ChatMessageStatus.COMPLETE)
        ).thenThrow(IllegalStateException("database unavailable"))

        StepVerifier.create(assistantService.streamReply(userId, chatId, "hi"))
            .expectNext("Hello")
            .expectErrorSatisfies { error ->
                assertTrue(
                    generateSequence(error) { it.cause }
                        .any { it.message?.contains("database unavailable") == true }
                )
            }
            .verify(Duration.ofSeconds(1))
    }

    @Test
    fun `streamReply persists PARTIAL when the client cancels after content`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        mockRequestChain()
        Mockito.`when`(chatService.appendUserMessage(userId, chatId, "hi")).thenReturn(history(chatId))
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.content())
            .thenReturn(Flux.concat(Flux.just("Hi"), Flux.never()))

        StepVerifier.create(assistantService.streamReply(userId, chatId, "hi"))
            .expectNext("Hi")
            .thenCancel()
            .verify(Duration.ofSeconds(1))

        Mockito.verify(chatService, Mockito.timeout(1000))
            .persistAssistantReply(chatId, "Hi", ChatMessageStatus.PARTIAL)
    }
}
