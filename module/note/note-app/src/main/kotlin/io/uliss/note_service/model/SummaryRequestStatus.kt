package io.uliss.note_service.model

/** Outcome of one Summarize request (create or update) of a chat. */
enum class SummaryRequestStatus {
    /** Accepted and waiting for its outbox event; at most one per chat, which blocks a new Summarize. */
    PENDING,

    /** The note was created or the addendum appended; the chat's boundary moved to the request's last message. */
    APPLIED,

    /** Update only: the new messages held no new user thoughts. The note is unchanged; the boundary still moved. */
    NOTHING_NEW,

    /** Generation failed terminally or the target note was gone. The note and the boundary are unchanged. */
    FAILED,
}
