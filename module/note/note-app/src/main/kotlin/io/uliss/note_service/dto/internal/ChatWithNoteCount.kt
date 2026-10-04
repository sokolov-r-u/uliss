package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.ChatEntity

/** A chat with the number of notes linked to it; crosses service → controller, never HTTP directly. */
data class ChatWithNoteCount(
    val chat: ChatEntity,
    val noteCount: Int,
)
