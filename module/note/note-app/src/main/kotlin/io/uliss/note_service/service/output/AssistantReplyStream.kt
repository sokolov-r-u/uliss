package io.uliss.note_service.service.output

import io.uliss.note_service.dto.internal.AssistantStreamEvent
import reactor.core.publisher.Flux
import java.util.UUID

data class AssistantReplyStream(
    val turnId: UUID,
    val events: Flux<AssistantStreamEvent>,
    val chatId: UUID,
)
