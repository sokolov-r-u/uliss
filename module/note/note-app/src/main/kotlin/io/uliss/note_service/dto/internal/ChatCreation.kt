package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.ChatEntity

/** The chat behind an initial request; [created] is false when the request key replays an existing chat. */
data class ChatCreation(val chat: ChatEntity, val created: Boolean)
