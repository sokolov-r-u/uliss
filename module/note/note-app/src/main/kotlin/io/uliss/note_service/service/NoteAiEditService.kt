package io.uliss.note_service.service

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.dto.internal.NoteAiEditEvent
import io.uliss.note_service.util.NoteAiEditPrompts
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.stereotype.Service
import reactor.core.publisher.Flux
import java.util.UUID

/**
 * Rewrites a note's text by the user's instruction and streams the result; nothing is saved. The text comes from the
 * client because it may hold unsaved edits; the saved note is only checked to be the user's and editable.
 */
@Service
class NoteAiEditService(
    private val chatClient: ChatClient,
    private val noteService: NoteService,
    private val properties: NoteAiEditProperties,
) {
    private val log = AppLogger.of(NoteAiEditService::class)

    /** Refusals are thrown before the stream starts; a provider failure ends the stream with [NoteAiEditEvent.Failed]. */
    fun streamRewrite(userId: UUID, noteId: UUID, instruction: String, content: String): Flux<NoteAiEditEvent> {
        noteService.checkNoteEditable(userId, noteId)
        return Flux.defer {
            chatClient.prompt()
                .system(NoteAiEditPrompts.SYSTEM_PROMPT)
                .user(NoteAiEditPrompts.userPrompt(instruction, content))
                .options(
                    OpenAiChatOptions.builder()
                        .reasoningEffort(properties.reasoningEffort)
                        .verbosity(properties.verbosity)
                )
                .stream()
                .content()
        }
            .filter { it.isNotEmpty() }
            .map<NoteAiEditEvent> { NoteAiEditEvent.AppendText(it) }
            .concatWith(Flux.just(NoteAiEditEvent.Completed))
            .onErrorResume { ex ->
                log.error("provider stream failed for note=$noteId", "streamRewrite", ex)
                Flux.just(NoteAiEditEvent.Failed)
            }
    }
}
