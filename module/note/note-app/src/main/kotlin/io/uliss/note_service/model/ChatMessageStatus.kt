package io.uliss.note_service.model

// COMPLETE: the assistant reply finished normally.
// PARTIAL: the stream was interrupted (network/DeepSeek error, client disconnect) but some content
// had already been buffered and shown to the user - saved as-is so replayed history matches it.
// FAILED: the stream/call was interrupted before any content arrived - saved with empty content so
// the failed attempt isn't silently invisible after a reload.
enum class ChatMessageStatus {
    COMPLETE,
    PARTIAL,
    FAILED,
}
