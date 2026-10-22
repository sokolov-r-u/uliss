package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.NoteIntegrationTest
import io.uliss.note_service.exception.NonRetryableOutboxException
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.repository.OutboxEventRepository
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.random.Random
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val HOUR: Duration = Duration.ofHours(1)

class OutboxDebounceIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var outboxService: OutboxService

    @Autowired
    lateinit var outboxEventRepository: OutboxEventRepository

    @Autowired
    lateinit var transactionManager: PlatformTransactionManager

    // claim() takes the oldest claimable rows; leftovers from other test classes would crowd out ours. Events that
    // background work of earlier tests may still add are told apart by key.
    @BeforeEach
    fun clearOutbox() {
        outboxEventRepository.deleteAll()
    }

    @Test
    fun `a repeated publish moves the pending event's time instead of adding a second event`() {
        val key = newKey()
        val before = Instant.now()
        publishDebounced(key, Duration.ofMinutes(10))
        val first = eventsWith(key).single()
        val second = Instant.now()
        publishDebounced(key, HOUR)

        val events = eventsWith(key)
        assertEquals(1, events.size)
        val event = events.single()
        assertEquals(first.id, event.id)
        assertEquals(OutboxEventStatus.PENDING, event.status)
        assertEquals(0, event.attempts)
        assertTrue(first.nextAttemptAt >= before.plus(Duration.ofMinutes(10)))
        assertTrue(event.nextAttemptAt >= second.plus(HOUR), "${event.nextAttemptAt}")
        assertTrue(event.nextAttemptAt <= Instant.now().plus(HOUR), "${event.nextAttemptAt}")
    }

    @Test
    fun `publishes racing in parallel transactions leave one pending event`() {
        val key = newKey()
        val threads = 8
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(threads)
        try {
            val futures = (1..threads).map {
                pool.submit {
                    start.await(10, TimeUnit.SECONDS)
                    TransactionTemplate(transactionManager).execute { publishDebounced(key, HOUR) }
                }
            }
            start.countDown()
            futures.forEach { it.get(30, TimeUnit.SECONDS) }
        } finally {
            pool.shutdownNow()
        }

        assertEquals(1, eventsWith(key).size)
    }

    @Test
    fun `a publish while the event is processing adds a second pending event`() {
        val key = newKey()
        publishDebounced(key, Duration.ZERO)
        val claimed = outboxService.claim(10).single { it.dedupKey == key }

        publishDebounced(key, HOUR)

        val events = eventsWith(key)
        assertEquals(2, events.size)
        assertEquals(OutboxEventStatus.PROCESSING, events.single { it.id == claimed.id }.status)
        assertEquals(OutboxEventStatus.PENDING, events.single { it.id != claimed.id }.status)
    }

    @Test
    fun `completed and failed events with the key do not stop a new pending one`() {
        val key = newKey()
        publishDebounced(key, Duration.ZERO)
        val completed = outboxService.claim(10).single { it.dedupKey == key }
        outboxService.complete(completed.id, requireNotNull(completed.leaseId))
        publishDebounced(key, Duration.ZERO)
        val failed = outboxService.claim(10).single { it.dedupKey == key }
        outboxService.recordFailure(failed.id, requireNotNull(failed.leaseId), NonRetryableOutboxException("x"))

        publishDebounced(key, HOUR)

        val statuses = eventsWith(key).map { it.status }.sortedBy { it.name }
        assertEquals(
            listOf(OutboxEventStatus.COMPLETED, OutboxEventStatus.FAILED, OutboxEventStatus.PENDING),
            statuses,
        )
    }

    @Test
    fun `a failed attempt gives way to a newer pending event with its key`() {
        // a retry would put a second PENDING row under the key
        val key = newKey()
        publishDebounced(key, Duration.ZERO)
        val claimed = outboxService.claim(10).single { it.dedupKey == key }
        publishDebounced(key, HOUR)

        outboxService.recordFailure(claimed.id, requireNotNull(claimed.leaseId), RuntimeException("boom"))

        val events = eventsWith(key)
        assertEquals(OutboxEventStatus.FAILED, events.single { it.id == claimed.id }.status)
        assertEquals(1, events.count { it.status == OutboxEventStatus.PENDING })
    }

    @Test
    fun `a plain publish is not deduplicated`() {
        val marker = UUID.randomUUID().toString()
        val payload = """{"marker":"$marker"}"""
        outboxService.publish(OutboxEventType.NOTE_INDEX_REQUESTED, payload)
        outboxService.publish(OutboxEventType.NOTE_INDEX_REQUESTED, payload)

        val events = outboxEventRepository.findAll().filter { marker in it.payload }
        assertEquals(2, events.size)
        assertTrue(events.all { it.dedupKey == null && it.status == OutboxEventStatus.PENDING })
    }

    @Test
    fun `any sequence of publishes and claims keeps at most one pending event due the last delay`() {
        // property over seeded random sequences: jqwik cannot run inside the Spring context
        repeat(SEQUENCES) { seed ->
            outboxEventRepository.deleteAll()
            val random = Random(seed)
            val key = newKey()
            var lastDelay: Duration? = null
            var lastPublishedAt = Instant.EPOCH
            repeat(random.nextInt(1, 12)) {
                if (random.nextInt(3) == 0) {
                    val claimed = outboxService.claim(10).filter { it.dedupKey == key }
                    if (claimed.isNotEmpty()) lastDelay = null
                    claimed.filter { random.nextBoolean() }
                        .forEach { outboxService.complete(it.id, requireNotNull(it.leaseId)) }
                } else {
                    // zero delay makes the event claimable at once, so claims interleave with debounces
                    val delay = if (random.nextBoolean()) Duration.ZERO else HOUR
                    lastPublishedAt = Instant.now()
                    publishDebounced(key, delay)
                    lastDelay = delay
                }
            }

            val pending = eventsWith(key).filter { it.status == OutboxEventStatus.PENDING }
            assertTrue(pending.size <= 1, "seed=$seed pending=${pending.size}")
            val delay = lastDelay
            if (delay == null) {
                assertTrue(pending.isEmpty(), "seed=$seed: a claim took the last publish")
            } else {
                val event = pending.single()
                assertTrue(event.nextAttemptAt >= lastPublishedAt.plus(delay), "seed=$seed ${event.nextAttemptAt}")
                assertTrue(event.nextAttemptAt <= Instant.now().plus(delay), "seed=$seed ${event.nextAttemptAt}")
                assertNull(event.leaseId)
            }
        }
    }

    private fun publishDebounced(key: String, delay: Duration) =
        outboxService.publishDebounced(OutboxEventType.NOTE_INDEX_REQUESTED, "{}", key, delay)

    private fun eventsWith(key: String): List<OutboxEventEntity> =
        outboxEventRepository.findAll().filter { it.dedupKey == key }

    private fun newKey() = "NOTE_INDEX_REQUESTED:${UUID.randomUUID()}"

    private companion object {
        const val SEQUENCES = 30
    }
}
