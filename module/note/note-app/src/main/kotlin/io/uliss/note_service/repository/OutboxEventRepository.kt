package io.uliss.note_service.repository

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.outbox.OutboxEventType
import jakarta.persistence.LockModeType
import jakarta.persistence.QueryHint
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.jpa.repository.QueryHints
import org.springframework.data.repository.CrudRepository
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.time.Instant
import java.util.UUID

@Repository
interface OutboxEventRepository : CrudRepository<OutboxEventEntity, UUID> {

    /**
     * `jakarta.persistence.lock.timeout = -2` is Hibernate's magic value for SKIP_LOCKED - lets
     * multiple instances poll concurrently without blocking on each other's claimed rows.
     *
     *
     * @param statuses **PENDING** - never attempted, or due for retry.
     *
     * **PROCESSING** - claimed by a worker whose visibility timeout has expired (e.g. it crashed
     * before finishing) - see [io.uliss.note_service.outbox.OutboxService.claim].
     * @param types only types this instance has a handler for; must not be empty.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query(
        "select e from OutboxEventEntity e " +
                "where e.status in :statuses and e.type in :types and e.nextAttemptAt <= :now " +
                "order by e.createdAt asc"
    )
    fun findClaimable(
        @Param("statuses") statuses: List<OutboxEventStatus>,
        @Param("types") types: Collection<OutboxEventType>,
        @Param("now") now: Instant,
        pageable: Pageable,
    ): List<OutboxEventEntity>

    fun existsByDedupKeyAndStatus(dedupKey: String, status: OutboxEventStatus): Boolean

    /**
     * Inserts a PENDING event under [dedupKey], or moves the time of the PENDING event that already holds it. One
     * statement, so parallel transactions cannot add a second one; a PROCESSING event does not hold the key.
     */
    @Modifying
    @Query(
        value = """
            INSERT INTO note.outbox_event
                (id, type, payload, status, attempts, next_attempt_at, created_at, updated_at, version, dedup_key)
            VALUES (:id, :type, CAST(:payload AS jsonb), 'PENDING', 0, :nextAttemptAt, :now, :now, 0, :dedupKey)
            ON CONFLICT (dedup_key) WHERE status = 'PENDING' AND dedup_key IS NOT NULL
            DO UPDATE SET next_attempt_at = excluded.next_attempt_at,
                          updated_at = excluded.updated_at,
                          version = note.outbox_event.version + 1
        """,
        nativeQuery = true,
    )
    fun upsertPendingByDedupKey(
        @Param("id") id: UUID,
        @Param("type") type: String,
        @Param("payload") payload: String,
        @Param("dedupKey") dedupKey: String,
        @Param("nextAttemptAt") nextAttemptAt: Instant,
        @Param("now") now: Instant,
    )
}
