package io.uliss.note_service.service

import org.springframework.ai.chat.client.ChatClient
import org.springframework.stereotype.Service

@Service
class AskService(
    private val chatClient: ChatClient,
) {

    // RAG enrichment (retrieve the user's notes from pgvector) will wrap this call later.
    fun ask(prompt: String): String =
        chatClient.prompt().user(prompt).call().content() ?: ""
}
