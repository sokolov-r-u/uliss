package io.uliss.note_service.outbox

interface OutboxHandler {

    val type: OutboxEventType

    fun handle(event: OutboxEventEntity)
}
