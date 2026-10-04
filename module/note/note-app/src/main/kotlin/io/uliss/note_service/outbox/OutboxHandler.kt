package io.uliss.note_service.outbox

import io.uliss.note_service.model.OutboxEventEntity

interface OutboxHandler {

    val type: OutboxEventType

    fun handle(event: OutboxEventEntity)
}

interface OutboxTerminalFailureHandler {

    val type: OutboxEventType

    fun handleTerminalFailure(event: OutboxEventEntity)
}
