package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import jakarta.persistence.LockModeType
import jakarta.persistence.QueryHint
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.Lock
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
     * before finishing) - see [OutboxService.claim].
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query(
        "select e from OutboxEventEntity e " +
                "where e.status in :statuses and e.nextAttemptAt <= :now " +
                "order by e.createdAt asc"
    )
    fun findClaimable(
        @Param("statuses") statuses: List<OutboxEventStatus>,
        @Param("now") now: Instant,
        pageable: Pageable,
    ): List<OutboxEventEntity>
}
