package io.uliss.note_service.service

import org.springframework.ai.chat.client.ChatClient
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class AskService(
    private val chatClient: ChatClient,
) {

    /** userId reserved for RAG retrieval (this user's notes from pgvector) in the next iteration. */
    fun ask(
        userId: UUID,
        prompt: String,
    ): String = chatClient.prompt().user(prompt).call().content() ?: ""
}
