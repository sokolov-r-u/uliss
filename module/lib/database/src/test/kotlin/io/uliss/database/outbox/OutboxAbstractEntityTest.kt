package io.uliss.database.outbox

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertTrue

private class TestOutboxAbstractEntity(
    payload: String,
    status: OutboxEventStatus,
    attempts: Int,
    nextAttemptAt: Instant,
    lastError: String?,
) : OutboxAbstractEntity(payload, status, attempts, nextAttemptAt, lastError)

class OutboxAbstractEntityTest {

    @Test
    fun `toString includes status and attempts and delegates to super`() {
        val entity = TestOutboxAbstractEntity(
            payload = "{}",
            status = OutboxEventStatus.PENDING,
            attempts = 2,
            nextAttemptAt = Instant.now(),
            lastError = null,
        )

        val result = entity.toString()

        assertTrue(result.contains("status=PENDING"))
        assertTrue(result.contains("attempts=2"))
        assertTrue(result.contains("createdAt="))
    }
}
