package io.uliss.note_service.util

import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole

/**
 * An assistant reply with no text (a FAILED or CANCELED turn, or whitespace only) carries nothing for the model;
 * history sent to a provider or used for retrieval skips it.
 */
fun ChatMessageEntity.isEmptyAssistantReply(): Boolean =
    role == ChatMessageRole.ASSISTANT && content.isBlank()
