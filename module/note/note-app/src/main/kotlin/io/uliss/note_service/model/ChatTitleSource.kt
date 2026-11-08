package io.uliss.note_service.model

enum class ChatTitleSource {
    /** Derived from the first message when the chat was created; a generated title may still replace it. */
    FIRST_MESSAGE,

    /** Written by the model from the first message. */
    GENERATED,

    /** Set by the user's rename; never replaced by a generated title. */
    USER,
}
