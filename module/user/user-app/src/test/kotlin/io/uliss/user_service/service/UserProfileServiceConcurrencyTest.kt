package io.uliss.user_service.service

import io.uliss.user_service.config.TestContainersConfiguration
import io.uliss.user_service.repository.MessageRepository
import io.uliss.user_service.repository.UserMessageRepository
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class UserProfileServiceConcurrencyTest {

    @Autowired
    lateinit var userProfileService: UserProfileService

    @Autowired
    lateinit var messageRepository: MessageRepository

    @Autowired
    lateinit var userMessageRepository: UserMessageRepository

    @Test
    fun `concurrent getOrCreate for a new user returns one profile seeded once`() {
        val authId = UUID.randomUUID()
        val callers = 8
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(callers)
        try {
            val futures = (1..callers).map {
                pool.submit<UUID> {
                    start.await()
                    userProfileService.getOrCreate(authId).id
                }
            }
            start.countDown()

            val ids = futures.map { it.get(30, TimeUnit.SECONDS) }.toSet()

            assertEquals(1, ids.size, "ids=$ids")
            assertEquals(messageRepository.count(), userMessageRepository.findAll().count { it.userMessageId.userId == ids.single() }.toLong())
        } finally {
            pool.shutdownNow()
        }
    }
}
