package io.uliss.note_service.repository

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.RequestFingerprint
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.IllegalTransactionStateException
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import kotlin.test.assertFailsWith
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
        val chatId = transactionTemplate.execute {
            val chat = chatRepository.save(ChatEntity(userId, "owned chat"))
            entityManager.flush()
            assertTrue(store.lockOwnedChat(userId, chat.id))
            assertNotNull(
                store.insert(
                    turnId = turnId,
                    userId = userId,
                    chatId = chat.id,
                    requestFingerprint = RequestFingerprint.from(ByteArray(32) { it.toByte() }),
                    leaseMillis = 60_000,
                ),
            )
            chat.id
        }

        try {
            assertNotNull(store.findById(userId, turnId))
            assertNotNull(store.findGenerating(userId, chatId))
            assertNull(store.findById(UUID.randomUUID(), turnId))
            assertNull(store.findGenerating(UUID.randomUUID(), chatId))
        } finally {
            transactionTemplate.executeWithoutResult {
                chatRepository.deleteById(chatId)
            }
        }
    }
}
