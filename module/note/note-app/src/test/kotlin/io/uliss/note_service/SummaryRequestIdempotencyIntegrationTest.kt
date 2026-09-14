package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.exception.IdempotencyKeyReusedException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequestStore
import io.uliss.note_service.service.NoteService
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.repository.CrudRepository
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class SummaryRequestIdempotencyIntegrationTest {

    @Autowired
    lateinit var noteService: NoteService

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @MockitoSpyBean
    lateinit var noteRepository: NoteRepository

    @MockitoSpyBean
    lateinit var chatNoteRepository: ChatNoteRepository

    @MockitoSpyBean
    lateinit var outboxService: OutboxService

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var transactionTemplate: TransactionTemplate

    @Autowired
    lateinit var summaryRequestStore: SummaryRequestStore

    @Test
    fun `sequential replay commits one summary result`() {
        val userId = UUID.randomUUID()
        val (chat, boundary) = createChatBoundary(userId)
        val idempotencyKey = UUID.randomUUID()

        val first = noteService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)
        val replay = noteService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)

        assertEquals(first.id, replay.id)
        assertSingleSummaryResult(userId, idempotencyKey, chat.id, first.id)
    }

    @Test
    fun `concurrent replay waits for the winner and commits one summary result`() {
        val userId = UUID.randomUUID()
        val (chat, boundary) = createChatBoundary(userId)
        val idempotencyKey = UUID.randomUUID()
        val winnerReady = CountDownLatch(1)
        val releaseWinner = CountDownLatch(1)
        val replayStarted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val winner = executor.submit<UUID> {
                transactionTemplate.execute {
                    val note = noteService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)
                    winnerReady.countDown()
                    check(releaseWinner.await(5, TimeUnit.SECONDS)) { "winner release timed out" }
                    note.id
                }
            }
            assertTrue(winnerReady.await(5, TimeUnit.SECONDS), "winner did not reach the commit barrier")

            val replay = executor.submit<UUID> {
                replayStarted.countDown()
                noteService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey).id
            }
            assertTrue(replayStarted.await(5, TimeUnit.SECONDS), "replay did not start")
            assertFailsWith<TimeoutException> { replay.get(250, TimeUnit.MILLISECONDS) }

            releaseWinner.countDown()
            val winnerNoteId = winner.get(5, TimeUnit.SECONDS)
            assertEquals(winnerNoteId, replay.get(5, TimeUnit.SECONDS))
            assertSingleSummaryResult(userId, idempotencyKey, chat.id, winnerNoteId)
        } finally {
            releaseWinner.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    fun `rollback after reservation releases the key for a successful retry`() {
        assertRollbackAndRetry(FailurePoint.NOTE)
    }

    @Test
    fun `rollback after note creation releases the key for a successful retry`() {
        assertRollbackAndRetry(FailurePoint.CHAT_NOTE)
    }

    @Test
    fun `rollback after link creation releases the key for a successful retry`() {
        assertRollbackAndRetry(FailurePoint.OUTBOX)
    }

    @Test
    fun `replay returns the original note while its current status changes`() {
        val userId = UUID.randomUUID()
        val (chat, boundary) = createChatBoundary(userId)
        val idempotencyKey = UUID.randomUUID()
        val original = noteService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)

        listOf(NoteStatus.GENERATING, NoteStatus.READY, NoteStatus.FAILED).forEach { status ->
            jdbcTemplate.update("UPDATE note.notes SET status = ? WHERE id = ?", status.name, original.id)

            val replay = noteService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)

            assertEquals(original.id, replay.id)
            assertEquals(status, replay.status)
        }
        assertSingleSummaryResult(userId, idempotencyKey, chat.id, original.id)
    }

    @Test
    fun `reusing a key for another chat creates no second summary result`() {
        val userId = UUID.randomUUID()
        val (firstChat, firstBoundary) = createChatBoundary(userId)
        val (secondChat, secondBoundary) = createChatBoundary(userId)
        val idempotencyKey = UUID.randomUUID()
        val first = noteService.requestChatSummary(userId, firstChat.id, firstBoundary.id, idempotencyKey)

        assertFailsWith<IdempotencyKeyReusedException> {
            noteService.requestChatSummary(userId, secondChat.id, secondBoundary.id, idempotencyKey)
        }

        assertSingleSummaryResult(userId, idempotencyKey, firstChat.id, first.id)
        assertEquals(0, count("SELECT COUNT(*) FROM note.chat_note WHERE chat_id = ?", secondChat.id))
    }

    @Test
    fun `the same key is isolated between users`() {
        val firstUserId = UUID.randomUUID()
        val secondUserId = UUID.randomUUID()
        val (firstChat, firstBoundary) = createChatBoundary(firstUserId)
        val (secondChat, secondBoundary) = createChatBoundary(secondUserId)
        val idempotencyKey = UUID.randomUUID()

        val first = noteService.requestChatSummary(firstUserId, firstChat.id, firstBoundary.id, idempotencyKey)
        val second = noteService.requestChatSummary(secondUserId, secondChat.id, secondBoundary.id, idempotencyKey)

        assertNotEquals(first.id, second.id)
        assertSingleSummaryResult(firstUserId, idempotencyKey, firstChat.id, first.id)
        assertSingleSummaryResult(secondUserId, idempotencyKey, secondChat.id, second.id)
        assertFalse(noteBelongsTo(second.id, firstUserId))
        assertFalse(noteBelongsTo(first.id, secondUserId))
    }

    @Test
    fun `reservation does not hide a conflict on the unique note id`() {
        val userId = UUID.randomUUID()
        val (chat, boundary) = createChatBoundary(userId)
        val first = noteService.requestChatSummary(userId, chat.id, boundary.id, UUID.randomUUID())

        assertFailsWith<DataIntegrityViolationException> {
            summaryRequestStore.reserve(
                userId,
                UUID.randomUUID(),
                chat.id,
                boundary.id,
                first.id,
            )
        }
    }

    private fun createChatBoundary(userId: UUID): Pair<ChatEntity, ChatMessageEntity> {
        val chat = chatRepository.save(ChatEntity(userId, "Summary idempotency test"))
        val boundary = chatMessageRepository.save(
            ChatMessageEntity(chat.id, ChatMessageRole.USER, "Summarize this", ChatMessageStatus.COMPLETE)
        )
        return chat to boundary
    }

    private fun assertRollbackAndRetry(failurePoint: FailurePoint) {
        val userId = UUID.randomUUID()
        val (chat, boundary) = createChatBoundary(userId)
        val idempotencyKey = UUID.randomUUID()
        when (failurePoint) {
            FailurePoint.NOTE -> {
                Mockito.doThrow(ExpectedRollback()).`when`(noteRepository)
                invokeRepositoryMethodForStubbing(
                    JpaRepository::class.java.getMethod("saveAndFlush", Any::class.java),
                    noteRepository,
                    anyValue<NoteEntity>(),
                )
            }

            FailurePoint.CHAT_NOTE -> {
                Mockito.doThrow(ExpectedRollback()).`when`(chatNoteRepository)
                invokeRepositoryMethodForStubbing(
                    CrudRepository::class.java.getMethod("save", Any::class.java),
                    chatNoteRepository,
                    anyValue<Any>(),
                )
            }

            FailurePoint.OUTBOX -> Mockito.doThrow(ExpectedRollback())
                .`when`(outboxService).publish(anyValue(), anyValue())
        }

        assertFailsWith<ExpectedRollback> {
            noteService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)
        }
        assertNoSummaryResult(userId, idempotencyKey, chat.id)

        Mockito.reset(noteRepository, chatNoteRepository, outboxService)
        val retry = noteService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)

        assertSingleSummaryResult(userId, idempotencyKey, chat.id, retry.id)
    }

    private fun invokeRepositoryMethodForStubbing(
        method: java.lang.reflect.Method,
        repository: Any,
        argument: Any?,
    ) {
        // Reflection bypasses Kotlin's non-null return check for the dummy invocation Mockito uses
        // while stubbing non-null Spring Data repository methods.
        method.invoke(repository, argument)
    }

    private fun assertSingleSummaryResult(
        userId: UUID,
        idempotencyKey: UUID,
        chatId: UUID,
        noteId: UUID,
    ) {
        assertEquals(
            1,
            count(
                "SELECT COUNT(*) FROM note.summary_request WHERE user_id = ? AND idempotency_key = ?",
                userId,
                idempotencyKey,
            ),
        )
        assertEquals(1, count("SELECT COUNT(*) FROM note.notes WHERE user_id = ?", userId))
        assertTrue(noteBelongsTo(noteId, userId))
        assertEquals(
            1,
            count(
                "SELECT COUNT(*) FROM note.chat_note WHERE chat_id = ? AND note_id = ?",
                chatId,
                noteId,
            ),
        )
        assertEquals(
            1,
            count(
                """
                    SELECT COUNT(*)
                    FROM note.outbox_event
                    WHERE type = 'NOTE_SUMMARY_REQUESTED'
                      AND payload ->> 'userId' = ?
                      AND payload ->> 'noteId' = ?
                """.trimIndent(),
                userId.toString(),
                noteId.toString(),
            ),
        )
    }

    private fun assertNoSummaryResult(userId: UUID, idempotencyKey: UUID, chatId: UUID) {
        assertEquals(
            0,
            count(
                "SELECT COUNT(*) FROM note.summary_request WHERE user_id = ? AND idempotency_key = ?",
                userId,
                idempotencyKey,
            ),
        )
        assertEquals(0, count("SELECT COUNT(*) FROM note.notes WHERE user_id = ?", userId))
        assertEquals(0, count("SELECT COUNT(*) FROM note.chat_note WHERE chat_id = ?", chatId))
        assertEquals(
            0,
            count(
                """
                    SELECT COUNT(*)
                    FROM note.outbox_event
                    WHERE type = 'NOTE_SUMMARY_REQUESTED'
                      AND payload ->> 'userId' = ?
                """.trimIndent(),
                userId.toString(),
            ),
        )
    }

    private fun noteBelongsTo(noteId: UUID, userId: UUID): Boolean =
        count("SELECT COUNT(*) FROM note.notes WHERE id = ? AND user_id = ?", noteId, userId) == 1

    private fun count(sql: String, vararg arguments: Any): Int =
        jdbcTemplate.queryForObject(sql, Int::class.java, *arguments) ?: 0

    private enum class FailurePoint {
        NOTE,
        CHAT_NOTE,
        OUTBOX,
    }

    private class ExpectedRollback : RuntimeException()
}
