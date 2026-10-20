package io.uliss.note_service

import io.uliss.note_service.service.NoteSummaryService
import io.uliss.note_service.exception.IdempotencyKeyReusedException
import io.uliss.note_service.exception.SummaryInProgressException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.SummaryRequestStatus
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequestStore
import io.uliss.note_service.service.NoteService
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
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

class SummaryRequestIdempotencyIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var noteService: NoteService

    @Autowired
    lateinit var noteSummaryService: NoteSummaryService

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

        val first = noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)
        val replay = noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)

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
                    val note = noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)
                    winnerReady.countDown()
                    check(releaseWinner.await(5, TimeUnit.SECONDS)) { "winner release timed out" }
                    note.id
                }
            }
            assertTrue(winnerReady.await(5, TimeUnit.SECONDS), "winner did not reach the commit barrier")

            val replay = executor.submit<UUID> {
                replayStarted.countDown()
                noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey).id
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
        val original = noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)

        listOf(NoteStatus.GENERATING, NoteStatus.READY, NoteStatus.FAILED).forEach { status ->
            jdbcTemplate.update("UPDATE note.notes SET status = ? WHERE id = ?", status.name, original.id)

            val replay = noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)

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
        val first = noteSummaryService.requestChatSummary(userId, firstChat.id, firstBoundary.id, idempotencyKey)

        assertFailsWith<IdempotencyKeyReusedException> {
            noteSummaryService.requestChatSummary(userId, secondChat.id, secondBoundary.id, idempotencyKey)
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

        val first = noteSummaryService.requestChatSummary(firstUserId, firstChat.id, firstBoundary.id, idempotencyKey)
        val second = noteSummaryService.requestChatSummary(secondUserId, secondChat.id, secondBoundary.id, idempotencyKey)

        assertNotEquals(first.id, second.id)
        assertSingleSummaryResult(firstUserId, idempotencyKey, firstChat.id, first.id)
        assertSingleSummaryResult(secondUserId, idempotencyKey, secondChat.id, second.id)
        assertFalse(noteBelongsTo(second.id, firstUserId))
        assertFalse(noteBelongsTo(first.id, secondUserId))
    }

    @Test
    fun `a second pending request for the chat is rejected as in progress`() {
        val userId = UUID.randomUUID()
        val (chat, boundary) = createChatBoundary(userId)
        noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, UUID.randomUUID())

        assertFailsWith<SummaryInProgressException> {
            noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, UUID.randomUUID())
        }
        assertEquals(1, count("SELECT COUNT(*) FROM note.summary_request WHERE chat_id = ?", chat.id))
    }

    @Test
    fun `finish moves only a pending request and returns it once`() {
        val userId = UUID.randomUUID()
        val (chat, boundary) = createChatBoundary(userId)
        val key = UUID.randomUUID()
        noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, key)

        val finished = summaryRequestStore.finish(userId, key, SummaryRequestStatus.APPLIED)
        val again = summaryRequestStore.finish(userId, key, SummaryRequestStatus.FAILED)

        assertEquals(SummaryRequestStatus.APPLIED, finished?.status)
        assertEquals(null, again)
        assertEquals("APPLIED", requestStatus(userId, key))
    }

    @Test
    fun `finishPendingForNote releases the chat for the next request`() {
        val userId = UUID.randomUUID()
        val (chat, boundary) = createChatBoundary(userId)
        val note = noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, UUID.randomUUID())

        val finished = summaryRequestStore.finishPendingForNote(note.id, SummaryRequestStatus.FAILED)
        noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, UUID.randomUUID())

        assertEquals(chat.id, finished?.chatId)
        assertEquals(boundary.id, finished?.throughMessageId)
        assertEquals(2, count("SELECT COUNT(*) FROM note.summary_request WHERE chat_id = ?", chat.id))
    }

    @Test
    fun `outbox accepts the summary update event type`() {
        jdbcTemplate.update(
            """
            INSERT INTO note.outbox_event (id, type, payload, status, attempts, next_attempt_at, created_at, updated_at)
            VALUES (?, 'NOTE_SUMMARY_UPDATE_REQUESTED', '{}'::jsonb, 'COMPLETED', 0, now(), now(), now())
            """.trimIndent(),
            UUID.randomUUID(),
        )
    }

    @Test
    fun `update requests for the same note are allowed one at a time and replay by key`() {
        val userId = UUID.randomUUID()
        val (chat, boundary) = createChatBoundary(userId)
        val note = noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, UUID.randomUUID())
        noteSummaryService.completeChatSummary(userId, note.id, "Title", "Body")
        val next = chatMessageRepository.save(
            ChatMessageEntity(chat.id, ChatMessageRole.USER, "More", ChatMessageStatus.COMPLETE),
        )
        val key = UUID.randomUUID()

        val first = noteSummaryService.requestChatSummaryUpdate(userId, chat.id, note.id, boundary.id, next.id, key)
        val replay = noteSummaryService.requestChatSummaryUpdate(userId, chat.id, note.id, boundary.id, next.id, key)

        assertEquals(note.id, first.id)
        assertEquals(note.id, replay.id)
        assertEquals(2, count("SELECT COUNT(*) FROM note.summary_request WHERE note_id = ?", note.id))
        assertFailsWith<SummaryInProgressException> {
            noteSummaryService.requestChatSummaryUpdate(userId, chat.id, note.id, boundary.id, next.id, UUID.randomUUID())
        }
    }

    @Test
    fun `pending lookups see only the user's pending requests`() {
        val userId = UUID.randomUUID()
        val (chat, boundary) = createChatBoundary(userId)
        val (otherChat, otherBoundary) = createChatBoundary(userId)
        val pending = noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, UUID.randomUUID())
        val finished = noteSummaryService.requestChatSummary(userId, otherChat.id, otherBoundary.id, UUID.randomUUID())
        summaryRequestStore.finishPendingForNote(finished.id, SummaryRequestStatus.FAILED)
        val (foreignChat, foreignBoundary) = createChatBoundary(UUID.randomUUID())
        noteSummaryService.requestChatSummary(foreignChat.userId, foreignChat.id, foreignBoundary.id, UUID.randomUUID())

        assertEquals(setOf(pending.id), summaryRequestStore.findPendingNoteIds(userId))
        assertTrue(summaryRequestStore.hasPendingForNote(pending.id))
        assertFalse(summaryRequestStore.hasPendingForNote(finished.id))
    }

    private fun requestStatus(userId: UUID, key: UUID): String? = jdbcTemplate.queryForObject(
        "SELECT status FROM note.summary_request WHERE user_id = ? AND idempotency_key = ?",
        String::class.java,
        userId,
        key,
    )

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
            noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)
        }
        assertNoSummaryResult(userId, idempotencyKey, chat.id)

        Mockito.reset(noteRepository, chatNoteRepository, outboxService)
        val retry = noteSummaryService.requestChatSummary(userId, chat.id, boundary.id, idempotencyKey)

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
