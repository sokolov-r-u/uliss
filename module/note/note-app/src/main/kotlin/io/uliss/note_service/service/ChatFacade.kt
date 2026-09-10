package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.NoteEntity
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import reactor.core.publisher.Flux
import java.util.UUID

@Service
class ChatFacade(
    private val chatService: ChatService,
    private val assistantService: AssistantService,
    private val noteService: NoteService,
) {

    fun createChat(userId: UUID, title: String?): ChatEntity = chatService.createChat(userId, title)

    fun getChats(userId: UUID): List<ChatEntity> = chatService.getChats(userId)

    fun getMessages(userId: UUID, chatId: UUID): List<ChatMessageEntity> =
        chatService.getMessages(userId, chatId)

    fun sendMessage(userId: UUID, chatId: UUID, prompt: String): ChatMessageEntity =
        assistantService.reply(userId, chatId, prompt)

    fun streamMessage(userId: UUID, chatId: UUID, prompt: String): Flux<String> =
        assistantService.streamReply(userId, chatId, prompt)

    @Transactional
    fun requestSummary(userId: UUID, chatId: UUID): NoteEntity {
        val history = chatService.getMessages(userId, chatId)
        val throughMessageId = history.lastOrNull()?.id
            ?: throw BadRequestException("chat id=$chatId has no messages to summarize")
        return noteService.requestChatSummary(userId, chatId, throughMessageId)
    }
}
