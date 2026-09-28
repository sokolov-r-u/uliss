package io.uliss.note_service.service.type

import reactor.core.publisher.Flux
import java.util.UUID

data class AssistantReplyStream(
    val turnId: UUID,
    val events: Flux<AssistantStreamEvent>,
)
