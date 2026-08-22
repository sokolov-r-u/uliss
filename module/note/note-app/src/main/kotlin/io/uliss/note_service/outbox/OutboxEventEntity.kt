package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxAbstractEntity
import io.uliss.database.outbox.OutboxEventStatus
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(name = "outbox_event", schema = "note")
class OutboxEventEntity(
    @Enumerated(EnumType.STRING)
    var type: OutboxEventType,
    payload: String,
    status: OutboxEventStatus,
    attempts: Int,
    nextAttemptAt: Instant,
    lastError: String?,
) : OutboxAbstractEntity(payload, status, attempts, nextAttemptAt, lastError) {

    override fun toString(): String {
        return "OutboxEventEntity(id=$id, type=$type" + super.toString()
    }
}
