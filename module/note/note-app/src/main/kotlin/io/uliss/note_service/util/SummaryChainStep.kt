package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.SummaryChunk
import io.uliss.note_service.service.ChatService
import java.util.UUID

/** The step a Summarize chain takes after the one that ends at its `throughMessageId`. */
object SummaryChainStep {

    /**
     * The next chunk after [throughMessageId] up to [targetMessageId]; null when the step has no target (one step
     * only), already reached it, or nothing is left before it (a retry removed the target).
     */
    fun next(
        chatService: ChatService,
        userId: UUID,
        chatId: UUID,
        throughMessageId: UUID,
        targetMessageId: UUID?,
        limitChars: Int,
    ): SummaryChunk? {
        val target = targetMessageId?.takeIf { it != throughMessageId } ?: return null
        val end = chatService.findSummaryChunkEnd(userId, chatId, throughMessageId, target, limitChars) ?: return null
        return SummaryChunk(end, target)
    }
}
