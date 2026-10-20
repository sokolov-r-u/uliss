package io.uliss.note_service.exception

/**
 * A handler failure that no retry can fix (the chat or note is gone). The outbox fails the event at once and runs its
 * terminal failure handler in the same transaction, so monitoring sees a FAILED event.
 */
class NonRetryableOutboxException(message: String) : RuntimeException(message)
