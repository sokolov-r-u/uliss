package io.uliss.note_service.model

enum class ChatMessageStatus {
    /** The assistant reply finished normally. */
    COMPLETE,

    /**
     * The stream was interrupted (network/DeepSeek error, client disconnect) but some content
     * had already been buffered and shown to the user - saved as-is so replayed history matches it.
     */
    PARTIAL,

    /**
     * The stream/call was interrupted before any content arrived - saved with empty content so
     * the failed attempt isn't silently invisible after a reload.
     */
    FAILED,
}
