package io.uliss.note_service.repository

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.projection.RequestFingerprint
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.IllegalTransactionStateException
import io.uliss.note_service.model.projection.ChatTurnStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class ChatTurnStoreIntegrationTest {

    @Autowired
    lateinit var store: ChatTurnStore

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var transactionTemplate: TransactionTemplate

    @Autowired
    lateinit var entityManager: EntityManager

    @Test
    fun `chat lock requires an existing transaction`() {
        assertFailsWith<IllegalTransactionStateException> {
            store.lockOwnedChat(UUID.randomUUID(), UUID.randomUUID())
        }
    }

    @Test
    fun `turn lookups enforce ownership`() {
        val userId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val chatId = transactionTemplate.execute {
            val chat = chatRepository.save(ChatEntity(userId, "owned chat"))
            entityManager.flush()
            assertTrue(store.lockOwnedChat(userId, chat.id))
            assertNotNull(
                store.insert(
                    turnId = turnId,
                    userId = userId,
                    chatId = chat.id,
                    idempotencyKey = idempotencyKey,
                    requestFingerprint = RequestFingerprint.from(ByteArray(32) { it.toByte() }),
                    leaseMillis = 60_000,
                ),
            )
            chat.id
        }

        try {
            assertNotNull(store.findById(userId, turnId))
            assertNotNull(store.findByIdempotencyKey(userId, chatId, idempotencyKey))
            assertNotNull(store.findGenerating(userId, chatId))
            assertNull(store.findById(UUID.randomUUID(), turnId))
            assertNull(store.findByIdempotencyKey(UUID.randomUUID(), chatId, idempotencyKey))
            assertNull(store.findGenerating(UUID.randomUUID(), chatId))
        } finally {
            transactionTemplate.executeWithoutResult {
                chatRepository.deleteById(chatId)
            }
        }
    }

    @Test
    fun `extending a lease is fenced by attempt and never shortens it`() {
        val userId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val chatId = insertGeneratingTurn(userId, turnId, leaseMillis = 1_000)

        try {
            assertFalse(store.extendLease(turnId, userId, chatId, attempt = 2, leaseMillis = 600_000))
            assertTrue(store.extendLease(turnId, userId, chatId, attempt = 1, leaseMillis = 600_000))
            val extended = assertNotNull(store.findById(userId, turnId)?.leaseUntil)
            assertTrue(extended.isAfter(Instant.now().plusSeconds(500)))

            assertTrue(store.extendLease(turnId, userId, chatId, attempt = 1, leaseMillis = 1))
            assertEquals(extended, store.findById(userId, turnId)?.leaseUntil)

            assertFalse(store.extendLease(turnId, UUID.randomUUID(), chatId, attempt = 1, leaseMillis = 600_000))
            assertTrue(store.transitionToTerminal(turnId, userId, chatId, 1, ChatTurnStatus.COMPLETE))
            assertFalse(store.extendLease(turnId, userId, chatId, attempt = 1, leaseMillis = 600_000))
        } finally {
            transactionTemplate.executeWithoutResult { chatRepository.deleteById(chatId) }
        }
    }

    private fun insertGeneratingTurn(userId: UUID, turnId: UUID, leaseMillis: Long): UUID =
        assertNotNull(transactionTemplate.execute {
            val chat = chatRepository.save(ChatEntity(userId, "owned chat"))
            entityManager.flush()
            assertTrue(store.lockOwnedChat(userId, chat.id))
            assertNotNull(
                store.insert(
                    turnId = turnId,
                    userId = userId,
                    chatId = chat.id,
                    idempotencyKey = UUID.randomUUID(),
                    requestFingerprint = RequestFingerprint.from(ByteArray(32) { it.toByte() }),
                    leaseMillis = leaseMillis,
                ),
            )
            chat.id
        })
}
