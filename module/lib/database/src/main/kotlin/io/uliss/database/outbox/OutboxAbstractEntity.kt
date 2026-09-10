package io.uliss.database.outbox

import io.uliss.database.entity.UuidEntity
import jakarta.persistence.Column
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.MappedSuperclass
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant

/**
 * Base outbox entity: id/timestamps/version come from [UuidEntity], plus the outbox state machine
 * (payload/status/attempts/backoff). Subclasses must declare their own `type` column (e.g.
 * `@Enumerated(EnumType.STRING) var type: OutboxEventType`), typed with their own module-specific
 * event-type enum - this base class is agnostic to what kinds of events a module publishes.
 */
@MappedSuperclass
abstract class OutboxAbstractEntity(
    // Raw JSON text - each consumer's handler knows the shape for its own type, the entity doesn't.
    @JdbcTypeCode(SqlTypes.JSON)
    var payload: String,
    @Enumerated(EnumType.STRING)
    var status: OutboxEventStatus,
    var attempts: Int,
    @Column(name = "next_attempt_at")
    var nextAttemptAt: Instant,
    @Column(name = "last_error")
    var lastError: String?,
) : UuidEntity() {

    override fun toString(): String {
        return ", status=$status, attempts=$attempts" + super.toString()
    }
}
