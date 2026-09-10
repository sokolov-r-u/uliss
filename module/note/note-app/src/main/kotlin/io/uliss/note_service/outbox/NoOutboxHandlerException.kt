package io.uliss.note_service.outbox

/**
 * A programming/deployment bug (a type was published but no handler was ever registered for it) -
 * not a retryable business failure, so [OutboxPoller] must not count it against attempts/backoff.
 */
class NoOutboxHandlerException(type: OutboxEventType) :
    IllegalStateException("no OutboxHandler registered for type=$type")
