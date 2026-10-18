package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.exception.ConstellationMoveCycleException
import io.uliss.note_service.repository.ConstellationRepository
import io.uliss.note_service.service.ConstellationService
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.ai.chat.client.ChatClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class ConstellationConcurrencyIntegrationTest {

    @Autowired
    lateinit var service: ConstellationService

    @Autowired
    lateinit var repository: ConstellationRepository

    @MockitoBean
    lateinit var chatClient: ChatClient

    @Test
    fun `two simultaneous moves of two roots under each other never close a cycle`() {
        Executors.newFixedThreadPool(2).use { executor ->
            repeat(10) {
                val userId = UUID.randomUUID()
                val a = service.create(userId, "A", null)
                val b = service.create(userId, "B", null)
                val start = CountDownLatch(1)
                val moves = listOf(a.id to b.id, b.id to a.id).map { (id, parentId) ->
                    executor.submit<Result<Unit>> {
                        start.await()
                        runCatching { service.move(userId, id, parentId) }.map { }
                    }
                }
                start.countDown()
                val results = moves.map { it.get(30, TimeUnit.SECONDS) }

                assertEquals(1, results.count { it.isSuccess }, "results $results")
                assertTrue(results.single { it.isFailure }.exceptionOrNull() is ConstellationMoveCycleException)
                val rows = repository.findByUserIdOrderByCreatedAtAscIdAsc(userId)
                assertEquals(1, rows.count { it.parentId == null })
            }
        }
    }
}
