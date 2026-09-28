package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.exception.ChatTurnAlreadyGeneratingException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatTurnStatus
import io.uliss.note_service.policy.ChatTurnExecutionPolicy
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.service.ChatTurnService
import io.uliss.note_service.service.type.ChatTurnRequestResolution
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class ChatTurnIdempotencyIntegrationTest {

    @Autowired
    lateinit var chatTurnService: ChatTurnService

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var transactionTemplate: TransactionTemplate

    @Autowired
    lateinit var executionPolicy: ChatTurnExecutionPolicy

    @Test
    fun `concurrent replay waits for the reservation and returns the same turn`() {
        val userId = UUID.randomUUID()
        val chatId = createChat(userId)
        val idempotencyKey = UUID.randomUUID()
        val winnerReady = CountDownLatch(1)
        val releaseWinner = CountDownLatch(1)
        val replayStarted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val winner = executor.submit<ChatTurnRequestResolution> {
                transactionTemplate.execute {
                    val resolution = chatTurnService.resolveTurnRequest(userId, chatId, idempotencyKey, "hello")
                    winnerReady.countDown()
                    check(releaseWinner.await(5, TimeUnit.SECONDS)) { "winner release timed out" }
                    resolution
                }
            }
            assertTrue(winnerReady.await(5, TimeUnit.SECONDS), "winner did not reach the commit barrier")

            val replay = executor.submit<ChatTurnRequestResolution> {
                replayStarted.countDown()
                chatTurnService.resolveTurnRequest(userId, chatId, idempotencyKey, "hello")
            }
            assertTrue(replayStarted.await(5, TimeUnit.SECONDS), "replay did not start")
            assertFailsWith<TimeoutException> { replay.get(250, TimeUnit.MILLISECONDS) }

            releaseWinner.countDown()
            val first = assertIs<ChatTurnRequestResolution.StartGeneration>(winner.get(5, TimeUnit.SECONDS))
            val duplicate = assertIs<ChatTurnRequestResolution.AlreadyGenerating>(
                replay.get(5, TimeUnit.SECONDS)
            )

            assertEquals(first.turn.id, duplicate.turn.id)
            assertTurnRows(chatId, first.turn.id, expectedUserMessages = 1, expectedAssistantMessages = 0)
        } finally {
            releaseWinner.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    fun `concurrent different key is rejected after the active reservation commits`() {
        val userId = UUID.randomUUID()
        val chatId = createChat(userId)
        val firstKey = UUID.randomUUID()
        val secondKey = UUID.randomUUID()
        val winnerReady = CountDownLatch(1)
        val releaseWinner = CountDownLatch(1)
        val contenderStarted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val winner = executor.submit<ChatTurnRequestResolution> {
                transactionTemplate.execute {
                    val resolution = chatTurnService.resolveTurnRequest(userId, chatId, firstKey, "first")
                    winnerReady.countDown()
                    check(releaseWinner.await(5, TimeUnit.SECONDS)) { "winner release timed out" }
                    resolution
                }
            }
            assertTrue(winnerReady.await(5, TimeUnit.SECONDS), "winner did not reach the commit barrier")

            val contender = executor.submit<Boolean> {
                contenderStarted.countDown()
                try {
                    chatTurnService.resolveTurnRequest(userId, chatId, secondKey, "second")
                    false
                } catch (_: ChatTurnAlreadyGeneratingException) {
                    true
                }
            }
            assertTrue(contenderStarted.await(5, TimeUnit.SECONDS), "contender did not start")
            assertFailsWith<TimeoutException> { contender.get(250, TimeUnit.MILLISECONDS) }

            releaseWinner.countDown()
            val first = assertIs<ChatTurnRequestResolution.StartGeneration>(winner.get(5, TimeUnit.SECONDS))
            assertTrue(contender.get(5, TimeUnit.SECONDS))
            assertEquals(1, count("SELECT COUNT(*) FROM note.chat_turn WHERE chat_id = ?", chatId))
            assertTurnRows(chatId, first.turn.id, expectedUserMessages = 1, expectedAssistantMessages = 0)
        } finally {
            releaseWinner.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    fun `rollback releases the reservation and user message for retry`() {
        val userId = UUID.randomUUID()
        val chatId = createChat(userId)
        val idempotencyKey = UUID.randomUUID()

        assertFailsWith<ExpectedRollback> {
            transactionTemplate.executeWithoutResult {
                chatTurnService.resolveTurnRequest(userId, chatId, idempotencyKey, "retry me")
                throw ExpectedRollback()
            }
        }
        assertEquals(0, count("SELECT COUNT(*) FROM note.chat_turn WHERE chat_id = ?", chatId))
        assertEquals(0, count("SELECT COUNT(*) FROM note.chat_message WHERE chat_id = ?", chatId))

        val retry = assertIs<ChatTurnRequestResolution.StartGeneration>(
            chatTurnService.resolveTurnRequest(userId, chatId, idempotencyKey, "retry me")
        )

        assertTurnRows(chatId, retry.turn.id, expectedUserMessages = 1, expectedAssistantMessages = 0)
    }

    @Test
    fun `expired reclaim fences the old attempt and persists one assistant message`() {
        val userId = UUID.randomUUID()
        val chatId = createChat(userId)
        val idempotencyKey = UUID.randomUUID()
        val first = assertIs<ChatTurnRequestResolution.StartGeneration>(
            chatTurnService.resolveTurnRequest(userId, chatId, idempotencyKey, "recover")
        )
        jdbcTemplate.update(
            "UPDATE note.chat_turn SET lease_until = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = ?",
            first.turn.id,
        )

        val reclaimed = assertIs<ChatTurnRequestResolution.StartGeneration>(
            chatTurnService.resolveTurnRequest(userId, chatId, idempotencyKey, "recover")
        )

        assertEquals(2, reclaimed.turn.attempt)
        assertEquals(
            false,
            chatTurnService.finishGenerationAttempt(
                userId,
                chatId,
                first.turn.id,
                first.turn.attempt,
                "stale",
                ChatTurnStatus.COMPLETE,
            ),
        )
        assertTrue(
            chatTurnService.finishGenerationAttempt(
                userId,
                chatId,
                reclaimed.turn.id,
                reclaimed.turn.attempt,
                "current",
                ChatTurnStatus.COMPLETE,
            )
        )
        assertEquals("current", singleAssistantContent(reclaimed.turn.id))
        assertTurnRows(chatId, reclaimed.turn.id, expectedUserMessages = 1, expectedAssistantMessages = 1)
    }

    @Test
    fun `concurrent finalization commits one assistant message`() {
        val userId = UUID.randomUUID()
        val chatId = createChat(userId)
        val resolution = assertIs<ChatTurnRequestResolution.StartGeneration>(
            chatTurnService.resolveTurnRequest(userId, chatId, UUID.randomUUID(), "finish once")
        )
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val outcomes = listOf("first", "second").map { content ->
                executor.submit<Boolean> {
                    ready.countDown()
                    check(start.await(5, TimeUnit.SECONDS)) { "finalization start timed out" }
                    chatTurnService.finishGenerationAttempt(
                        userId,
                        chatId,
                        resolution.turn.id,
                        resolution.turn.attempt,
                        content,
                        ChatTurnStatus.COMPLETE,
                    )
                }
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS), "finalizers did not reach the start barrier")
            start.countDown()

            assertEquals(1, outcomes.count { it.get(5, TimeUnit.SECONDS) })
            assertTurnRows(chatId, resolution.turn.id, expectedUserMessages = 1, expectedAssistantMessages = 1)
        } finally {
            start.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    fun `cancellation is durable idempotent and fences the provider attempt`() {
        val userId = UUID.randomUUID()
        val chatId = createChat(userId)
        val resolution = assertIs<ChatTurnRequestResolution.StartGeneration>(
            chatTurnService.resolveTurnRequest(userId, chatId, UUID.randomUUID(), "cancel me")
        )

        val canceled = chatTurnService.cancelTurn(userId, chatId, resolution.turn.id)
        val replay = chatTurnService.cancelTurn(userId, chatId, resolution.turn.id)

        assertEquals(ChatTurnStatus.CANCELED, canceled.status)
        assertEquals(ChatTurnStatus.CANCELED, replay.status)
        assertEquals(
            false,
            chatTurnService.finishGenerationAttempt(
                userId,
                chatId,
                resolution.turn.id,
                resolution.turn.attempt,
                "late",
                ChatTurnStatus.COMPLETE,
            ),
        )
        assertEquals("CANCELED", singleAssistantStatus(resolution.turn.id))
        assertTurnRows(chatId, resolution.turn.id, expectedUserMessages = 1, expectedAssistantMessages = 1)
    }

    @Test
    fun `expired turn at the attempt limit becomes failed once`() {
        val userId = UUID.randomUUID()
        val chatId = createChat(userId)
        val idempotencyKey = UUID.randomUUID()
        val resolution = assertIs<ChatTurnRequestResolution.StartGeneration>(
            chatTurnService.resolveTurnRequest(userId, chatId, idempotencyKey, "exhaust retries")
        )
        jdbcTemplate.update(
            """
                UPDATE note.chat_turn
                SET attempt = ?, lease_until = CURRENT_TIMESTAMP - INTERVAL '1 second'
                WHERE id = ?
            """.trimIndent(),
            executionPolicy.maxAttempts,
            resolution.turn.id,
        )

        val failed = assertIs<ChatTurnRequestResolution.AlreadyFinished>(
            chatTurnService.resolveTurnRequest(userId, chatId, idempotencyKey, "exhaust retries")
        )
        val replay = assertIs<ChatTurnRequestResolution.AlreadyFinished>(
            chatTurnService.resolveTurnRequest(userId, chatId, idempotencyKey, "exhaust retries")
        )

        assertEquals(ChatTurnStatus.FAILED, failed.turn.status)
        assertEquals(ChatTurnStatus.FAILED, replay.turn.status)
        assertEquals("FAILED", singleAssistantStatus(resolution.turn.id))
        assertTurnRows(chatId, resolution.turn.id, expectedUserMessages = 1, expectedAssistantMessages = 1)
    }

    private fun createChat(userId: UUID): UUID =
        chatRepository.save(ChatEntity(userId, "Chat turn idempotency test")).id

    private fun assertTurnRows(
        chatId: UUID,
        turnId: UUID,
        expectedUserMessages: Int,
        expectedAssistantMessages: Int,
    ) {
        assertEquals(1, count("SELECT COUNT(*) FROM note.chat_turn WHERE id = ? AND chat_id = ?", turnId, chatId))
        assertEquals(
            expectedUserMessages,
            count(
                "SELECT COUNT(*) FROM note.chat_message WHERE turn_id = ? AND role = 'USER'",
                turnId,
            ),
        )
        assertEquals(
            expectedAssistantMessages,
            count(
                "SELECT COUNT(*) FROM note.chat_message WHERE turn_id = ? AND role = 'ASSISTANT'",
                turnId,
            ),
        )
    }

    private fun singleAssistantContent(turnId: UUID): String =
        jdbcTemplate.queryForObject(
            "SELECT content FROM note.chat_message WHERE turn_id = ? AND role = 'ASSISTANT'",
            String::class.java,
            turnId,
        ) ?: error("assistant message not found")

    private fun singleAssistantStatus(turnId: UUID): String =
        jdbcTemplate.queryForObject(
            "SELECT status FROM note.chat_message WHERE turn_id = ? AND role = 'ASSISTANT'",
            String::class.java,
            turnId,
        ) ?: error("assistant message not found")

    private fun count(sql: String, vararg arguments: Any): Int =
        jdbcTemplate.queryForObject(sql, Int::class.java, *arguments) ?: 0

    private class ExpectedRollback : RuntimeException()
}
