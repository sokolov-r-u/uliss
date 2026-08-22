package io.uliss.database.outbox

enum class OutboxEventStatus { PENDING, PROCESSING, COMPLETED, FAILED }
