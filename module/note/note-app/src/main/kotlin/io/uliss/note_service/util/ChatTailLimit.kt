package io.uliss.note_service.util

/** Whether a new user message may join a chat's unsummarized tail. */
object ChatTailLimit {

    /** An empty tail takes any message, which could never be sent otherwise. */
    fun refuses(tailChars: Long, messageChars: Int, hardChars: Int): Boolean =
        tailChars > 0 && tailChars + messageChars > hardChars
}
