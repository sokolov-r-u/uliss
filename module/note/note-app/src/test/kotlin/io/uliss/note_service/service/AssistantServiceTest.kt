package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.captorFor
import io.uliss.note_service.captureValue
import io.uliss.note_service.exception.ChatTurnAlreadyGeneratingException
import io.uliss.note_service.exception.IdempotencyKeyReusedException
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.ChatTurn
import io.uliss.note_service.model.ChatTurnStatus
import io.uliss.note_service.model.RequestFingerprint
import io.uliss.note_service.policy.ChatTurnExecutionPolicy
import io.uliss.note_service.prompt.ChatPrompts
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatTurnStore
import io.uliss.note_service.service.type.AssistantStreamEvent
import io.uliss.note_service.service.type.ChatTurnRequestResolution
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.Message
import org.springframework.ai.chat.messages.UserMessage
import reactor.core.publisher.Flux
import reactor.test.StepVerifier
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertSame
import kotlin.test.assertTrue

class AssistantServiceTest {

    private val chatClient = Mockito.mock(ChatClient::class.java)
    private val chatTurnService = Mockito.mock(ChatTurnService::class.java)
    private val assistantService = AssistantService(chatClient, chatTurnService)
    private val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)

    private fun history(chatId: UUID, turnId: UUID) = listOf(
        ChatMessageEntity(chatId, ChatMessageRole.USER, "hi", ChatMessageStatus.COMPLETE, turnId),
        ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "hello", ChatMessageStatus.COMPLETE),
    )

    private fun turn(userId: UUID, chatId: UUID, turnId: UUID, status: ChatTurnStatus, attempt: Int = 1) = ChatTurn(
        id = turnId,
        userId = userId,
        chatId = chatId,
        idempotencyKey = turnId,
        requestFingerprint = RequestFingerprint.from(ByteArray(32) { 1 }),
        status = status,
        attempt = attempt,
        leaseUntil = if (status == ChatTurnStatus.GENERATING) Instant.now().plusSeconds(60) else null,
        retryAfterMs = if (status == ChatTurnStatus.GENERATING) 60_000 else 0,
    )

    private fun mockRequestChain() {
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(ChatPrompts.CHAT_SYSTEM_PROMPT)).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.messages(anyValue<List<Message>>())).thenReturn(requestSpec)
    }

    @Test
    fun `new turn emits tokens and waits for durable COMPLETE finalization before done`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val turn = turn(userId, chatId, turnId, ChatTurnStatus.GENERATING)
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        val persistenceStarted = CountDownLatch(1)
        val releasePersistence = CountDownLatch(1)
        mockRequestChain()
        Mockito.`when`(chatTurnService.resolveTurnRequest(userId, chatId, turnId, "hi"))
            .thenReturn(ChatTurnRequestResolution.StartGeneration(turn, history(chatId, turnId)))
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.content()).thenReturn(Flux.just("Hel", "lo"))
        Mockito.`when`(
            chatTurnService.finishGenerationAttempt(userId, chatId, turnId, 1, "Hello", ChatTurnStatus.COMPLETE)
        ).thenAnswer {
            persistenceStarted.countDown()
            assertTrue(releasePersistence.await(1, TimeUnit.SECONDS))
            true
        }

        StepVerifier.create(assistantService.streamReply(userId, chatId, turnId, "hi"))
            .expectNext(AssistantStreamEvent.AppendText("Hel"), AssistantStreamEvent.AppendText("lo"))
            .then { assertTrue(persistenceStarted.await(1, TimeUnit.SECONDS)) }
            .expectNoEvent(Duration.ofMillis(100))
            .then(releasePersistence::countDown)
            .expectNext(AssistantStreamEvent.GenerationCompleted)
            .verifyComplete()

        val captor = captorFor<List<Message>>(List::class.java)
        Mockito.verify(requestSpec).messages(captor.captureValue())
        assertEquals("hi", (captor.value[0] as UserMessage).text)
        assertEquals("hello", (captor.value[1] as AssistantMessage).text)
    }

    @Test
    fun `failed stream finalizes PARTIAL after content and propagates the provider error`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val start = ChatTurnRequestResolution.StartGeneration(
            turn(userId, chatId, turnId, ChatTurnStatus.GENERATING),
            history(chatId, turnId),
        )
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        mockRequestChain()
        Mockito.`when`(chatTurnService.resolveTurnRequest(userId, chatId, turnId, "hi")).thenReturn(start)
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.content())
            .thenReturn(Flux.concat(Flux.just("Hi"), Flux.error(RuntimeException("boom"))))
        Mockito.`when`(
            chatTurnService.finishGenerationAttempt(userId, chatId, turnId, 1, "Hi", ChatTurnStatus.PARTIAL)
        ).thenReturn(true)

        StepVerifier.create(assistantService.streamReply(userId, chatId, turnId, "hi"))
            .expectNext(AssistantStreamEvent.AppendText("Hi"))
            .expectError(RuntimeException::class.java)
            .verify(Duration.ofSeconds(1))
    }

    @Test
    fun `failed stream finalizes FAILED when no content arrived`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val start = ChatTurnRequestResolution.StartGeneration(
            turn(userId, chatId, turnId, ChatTurnStatus.GENERATING),
            history(chatId, turnId),
        )
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        mockRequestChain()
        Mockito.`when`(chatTurnService.resolveTurnRequest(userId, chatId, turnId, "hi")).thenReturn(start)
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.content()).thenReturn(Flux.error(RuntimeException("boom")))
        Mockito.`when`(
            chatTurnService.finishGenerationAttempt(userId, chatId, turnId, 1, "", ChatTurnStatus.FAILED)
        ).thenReturn(true)

        StepVerifier.create(assistantService.streamReply(userId, chatId, turnId, "hi"))
            .expectError(RuntimeException::class.java)
            .verify(Duration.ofSeconds(1))
    }

    @Test
    fun `terminal and pending replays do not call the provider`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val complete = turn(userId, chatId, turnId, ChatTurnStatus.COMPLETE)
        Mockito.`when`(chatTurnService.resolveTurnRequest(userId, chatId, turnId, "hi"))
            .thenReturn(ChatTurnRequestResolution.AlreadyFinished(complete))

        StepVerifier.create(assistantService.streamReply(userId, chatId, turnId, "hi"))
            .expectNext(AssistantStreamEvent.GenerationCompleted)
            .verifyComplete()

        val pendingTurnId = UUID.randomUUID()
        val pending = turn(userId, chatId, pendingTurnId, ChatTurnStatus.GENERATING)
        Mockito.`when`(chatTurnService.resolveTurnRequest(userId, chatId, pendingTurnId, "next"))
            .thenReturn(ChatTurnRequestResolution.AlreadyGenerating(pending))
        StepVerifier.create(assistantService.streamReply(userId, chatId, pendingTurnId, "next"))
            .expectNext(AssistantStreamEvent.GenerationPending(60_000))
            .verifyComplete()

        Mockito.verifyNoInteractions(chatClient)
    }

    @Test
    fun `stale attempt never emits done`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val start = ChatTurnRequestResolution.StartGeneration(
            turn(userId, chatId, turnId, ChatTurnStatus.GENERATING),
            history(chatId, turnId),
        )
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        mockRequestChain()
        Mockito.`when`(chatTurnService.resolveTurnRequest(userId, chatId, turnId, "hi")).thenReturn(start)
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.content()).thenReturn(Flux.just("obsolete"))
        Mockito.`when`(
            chatTurnService.finishGenerationAttempt(userId, chatId, turnId, 1, "obsolete", ChatTurnStatus.COMPLETE)
        ).thenReturn(false)

        StepVerifier.create(assistantService.streamReply(userId, chatId, turnId, "hi"))
            .expectNext(AssistantStreamEvent.AppendText("obsolete"))
            .expectErrorMatches { error ->
                generateSequence(error) { it.cause }
                    .any { it.message?.contains("became stale") == true }
            }
            .verify(Duration.ofSeconds(1))
    }
}

class ChatTurnServiceTest {

    private val store = Mockito.mock(ChatTurnStore::class.java)
    private val messages = Mockito.mock(ChatMessageRepository::class.java)
    private val executionPolicy = Mockito.mock(ChatTurnExecutionPolicy::class.java).also {
        Mockito.`when`(it.maxAttempts).thenReturn(3)
        Mockito.`when`(it.lease).thenReturn(Duration.ofSeconds(300))
    }
    private val service = ChatTurnService(store, messages, executionPolicy)

    @Test
    fun `first request reserves turn and saves exactly one turn-backed user message`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(store.lockOwnedChat(userId, chatId)).thenReturn(true)
        Mockito.`when`(store.findByIdempotencyKey(userId, chatId, idempotencyKey)).thenReturn(null)
        Mockito.`when`(store.findGenerating(userId, chatId)).thenReturn(null)
        Mockito.`when`(
            store.insert(
                anyValue(),
                anyValue(),
                anyValue(),
                anyValue(),
                anyValue(),
                Mockito.anyLong(),
            )
        ).thenAnswer {
            generatingTurn(userId, chatId, it.getArgument(0), idempotencyKey, it.getArgument(4))
        }
        Mockito.`when`(messages.findByChatIdOrderByCreatedAtAscIdAsc(chatId)).thenReturn(emptyList())
        Mockito.`when`(messages.save(anyValue())).thenAnswer { it.getArgument<ChatMessageEntity>(0) }

        val result = assertIs<ChatTurnRequestResolution.StartGeneration>(
            service.resolveTurnRequest(userId, chatId, idempotencyKey, " exact ")
        )

        assertEquals(idempotencyKey, result.turn.idempotencyKey)
        assertEquals(" exact ", result.history.single().content)
        assertEquals(result.turn.id, result.history.single().turnId)
        Mockito.verify(messages, Mockito.times(1)).save(anyValue())
    }

    @Test
    fun `same key and exact content returns pending without another message`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(store.lockOwnedChat(userId, chatId)).thenReturn(true)
        Mockito.`when`(store.findByIdempotencyKey(userId, chatId, idempotencyKey)).thenReturn(null)
        Mockito.`when`(store.findGenerating(userId, chatId)).thenReturn(null)
        Mockito.`when`(store.insert(anyValue(), anyValue(), anyValue(), anyValue(), anyValue(), Mockito.anyLong()))
            .thenAnswer { generatingTurn(userId, chatId, it.getArgument(0), idempotencyKey, it.getArgument(4)) }
        Mockito.`when`(messages.findByChatIdOrderByCreatedAtAscIdAsc(chatId)).thenReturn(emptyList())
        Mockito.`when`(messages.save(anyValue())).thenAnswer { it.getArgument<ChatMessageEntity>(0) }
        val first = assertIs<ChatTurnRequestResolution.StartGeneration>(
            service.resolveTurnRequest(userId, chatId, idempotencyKey, "hi")
        )
        Mockito.`when`(store.findByIdempotencyKey(userId, chatId, idempotencyKey)).thenReturn(first.turn)

        val replay = assertIs<ChatTurnRequestResolution.AlreadyGenerating>(
            service.resolveTurnRequest(userId, chatId, idempotencyKey, "hi")
        )

        assertSame(first.turn, replay.turn)
        Mockito.verify(store, Mockito.times(1))
            .insert(anyValue(), anyValue(), anyValue(), anyValue(), anyValue(), Mockito.anyLong())
        Mockito.verify(messages, Mockito.times(1)).save(anyValue())
    }

    @Test
    fun `same key with changed content is rejected`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(store.lockOwnedChat(userId, chatId)).thenReturn(true)
        Mockito.`when`(store.findByIdempotencyKey(userId, chatId, idempotencyKey)).thenReturn(null)
        Mockito.`when`(store.findGenerating(userId, chatId)).thenReturn(null)
        Mockito.`when`(store.insert(anyValue(), anyValue(), anyValue(), anyValue(), anyValue(), Mockito.anyLong()))
            .thenAnswer { generatingTurn(userId, chatId, it.getArgument(0), idempotencyKey, it.getArgument(4)) }
        Mockito.`when`(messages.findByChatIdOrderByCreatedAtAscIdAsc(chatId)).thenReturn(emptyList())
        Mockito.`when`(messages.save(anyValue())).thenAnswer { it.getArgument<ChatMessageEntity>(0) }
        val first = assertIs<ChatTurnRequestResolution.StartGeneration>(
            service.resolveTurnRequest(userId, chatId, idempotencyKey, "hi")
        )
        Mockito.`when`(store.findByIdempotencyKey(userId, chatId, idempotencyKey)).thenReturn(first.turn)

        assertFailsWith<IdempotencyKeyReusedException> {
            service.resolveTurnRequest(userId, chatId, idempotencyKey, "changed")
        }
    }

    @Test
    fun `different key is rejected while another turn is generating`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val active = generatingTurn(
            userId,
            chatId,
            UUID.randomUUID(),
            UUID.randomUUID(),
            RequestFingerprint.from(ByteArray(32) { 2 }),
        )
        Mockito.`when`(store.lockOwnedChat(userId, chatId)).thenReturn(true)
        Mockito.`when`(store.findByIdempotencyKey(userId, chatId, idempotencyKey)).thenReturn(null)
        Mockito.`when`(store.findGenerating(userId, chatId)).thenReturn(active)

        assertFailsWith<ChatTurnAlreadyGeneratingException> {
            service.resolveTurnRequest(userId, chatId, idempotencyKey, "next")
        }
        Mockito.verifyNoInteractions(messages)
    }

    @Test
    fun `expired same-key turn is reclaimed with the next fenced attempt`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val fingerprint = RequestFingerprint.from(ByteArray(32) { 3 })
        val expired = generatingTurn(userId, chatId, turnId, idempotencyKey, fingerprint, retryAfterMs = 0)
        val claimed = expired.copy(attempt = 2, retryAfterMs = 300_000)
        val userMessage = ChatMessageEntity(
            chatId,
            ChatMessageRole.USER,
            "hi",
            ChatMessageStatus.COMPLETE,
            turnId,
        )
        Mockito.`when`(store.lockOwnedChat(userId, chatId)).thenReturn(true)
        Mockito.`when`(store.findByIdempotencyKey(userId, chatId, idempotencyKey)).thenReturn(expired)
        Mockito.`when`(store.claimExpired(turnId, userId, chatId, 1, 3, 300_000)).thenReturn(claimed)
        Mockito.`when`(messages.findByChatIdOrderByCreatedAtAscIdAsc(chatId)).thenReturn(listOf(userMessage))

        // The stored fingerprint must match the service's canonical representation, so capture it
        // from an initial reservation rather than duplicating that implementation in this test.
        val freshKey = UUID.randomUUID()
        Mockito.`when`(store.findByIdempotencyKey(userId, chatId, freshKey)).thenReturn(null)
        Mockito.`when`(store.findGenerating(userId, chatId)).thenReturn(null)
        Mockito.`when`(store.insert(anyValue(), anyValue(), anyValue(), anyValue(), anyValue(), Mockito.anyLong()))
            .thenAnswer { generatingTurn(userId, chatId, it.getArgument(0), freshKey, it.getArgument(4)) }
        Mockito.`when`(messages.save(anyValue())).thenAnswer { it.getArgument<ChatMessageEntity>(0) }
        val canonical = assertIs<ChatTurnRequestResolution.StartGeneration>(
            service.resolveTurnRequest(userId, chatId, freshKey, "hi")
        ).turn
        val matchingExpired = expired.copy(requestFingerprint = canonical.requestFingerprint)
        val matchingClaimed = claimed.copy(requestFingerprint = canonical.requestFingerprint)
        Mockito.`when`(store.findByIdempotencyKey(userId, chatId, idempotencyKey)).thenReturn(matchingExpired)
        Mockito.`when`(store.claimExpired(turnId, userId, chatId, 1, 3, 300_000)).thenReturn(matchingClaimed)

        val result = assertIs<ChatTurnRequestResolution.StartGeneration>(
            service.resolveTurnRequest(userId, chatId, idempotencyKey, "hi")
        )

        assertEquals(2, result.turn.attempt)
        assertSame(userMessage, result.history.single())
    }

    @Test
    fun `finalization saves assistant only when the fenced transition wins`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        Mockito.`when`(
            store.transitionToTerminal(turnId, userId, chatId, 2, ChatTurnStatus.COMPLETE)
        ).thenReturn(false, true)
        Mockito.`when`(messages.save(anyValue())).thenAnswer { it.getArgument<ChatMessageEntity>(0) }

        assertEquals(
            false,
            service.finishGenerationAttempt(userId, chatId, turnId, 2, "old", ChatTurnStatus.COMPLETE),
        )
        Mockito.verifyNoInteractions(messages)

        assertEquals(
            true,
            service.finishGenerationAttempt(userId, chatId, turnId, 2, "answer", ChatTurnStatus.COMPLETE),
        )
        val saved = captorFor<ChatMessageEntity>(ChatMessageEntity::class.java)
        Mockito.verify(messages).save(saved.captureValue())
        assertEquals(turnId, saved.value.turnId)
        assertEquals("answer", saved.value.content)
        assertEquals(ChatMessageStatus.COMPLETE, saved.value.status)
    }

    private fun generatingTurn(
        userId: UUID,
        chatId: UUID,
        turnId: UUID,
        idempotencyKey: UUID,
        fingerprint: RequestFingerprint,
        attempt: Int = 1,
        retryAfterMs: Long = 300_000,
    ) = ChatTurn(
        id = turnId,
        userId = userId,
        chatId = chatId,
        idempotencyKey = idempotencyKey,
        requestFingerprint = fingerprint,
        status = ChatTurnStatus.GENERATING,
        attempt = attempt,
        leaseUntil = Instant.now().plusMillis(retryAfterMs),
        retryAfterMs = retryAfterMs,
    )
}
