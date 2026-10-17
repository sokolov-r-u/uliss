package io.uliss.note_service.service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.dto.internal.NoteAiEditEvent
import io.uliss.note_service.exception.NoteUpdatingException
import io.uliss.note_service.util.NoteAiEditPrompts
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import reactor.core.publisher.Flux
import reactor.test.StepVerifier
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NoteAiEditServiceTest {

    private val chatClient = Mockito.mock(ChatClient::class.java)
    private val noteService = Mockito.mock(NoteService::class.java)
    private val service = NoteAiEditService(
        chatClient,
        noteService,
        NoteAiEditProperties(reasoningEffort = "low", verbosity = "medium"),
    )
    private val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
    private val streamSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
    private val userId = UUID.randomUUID()
    private val noteId = UUID.randomUUID()

    private fun mockProvider(tokens: Flux<String>) {
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(Mockito.anyString())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(Mockito.anyString())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.stream()).thenReturn(streamSpec)
        Mockito.`when`(streamSpec.content()).thenReturn(tokens)
    }

    @Test
    fun `the model's tokens are streamed as appends and end with completion`() {
        mockProvider(Flux.just("# Ti", "", "tle\n\nbody"))

        StepVerifier.create(service.streamRewrite(userId, noteId, "Fix spelling", "# Titel\n\nbody"))
            .expectNext(NoteAiEditEvent.AppendText("# Ti"))
            .expectNext(NoteAiEditEvent.AppendText("tle\n\nbody"))
            .expectNext(NoteAiEditEvent.Completed)
            .verifyComplete()
    }

    @Test
    fun `the prompt carries the instruction and the note text as fenced data, without the title`() {
        mockProvider(Flux.just("ok"))

        service.streamRewrite(userId, noteId, "Make it shorter", "Line one\nLine two").blockLast()

        Mockito.verify(requestSpec).system(NoteAiEditPrompts.SYSTEM_PROMPT)
        val user = ArgumentCaptor.forClass(String::class.java)
        Mockito.verify(requestSpec).user(user.capture())
        assertEquals(NoteAiEditPrompts.userPrompt("Make it shorter", "Line one\nLine two"), user.value)
        assertTrue(user.value.contains("Make it shorter"))
        assertTrue(user.value.contains("<note>\nLine one\nLine two\n</note>"))
        val options = ArgumentCaptor.forClass(OpenAiChatOptions.Builder::class.java)
        Mockito.verify(requestSpec).options(options.capture())
        val built = options.value.build()
        assertEquals("low", built.reasoningEffort)
        assertEquals("medium", built.verbosity)
    }

    @Test
    fun `a note that cannot be edited is refused before the model is called`() {
        Mockito.`when`(noteService.checkNoteEditable(userId, noteId)).thenThrow(NoteUpdatingException(noteId))

        assertFailsWith<NoteUpdatingException> { service.streamRewrite(userId, noteId, "Fix", "text") }
        Mockito.verifyNoInteractions(chatClient)
    }

    @Test
    fun `a foreign note is refused as missing before the model is called`() {
        Mockito.`when`(noteService.checkNoteEditable(userId, noteId)).thenThrow(NotFoundException("missing"))

        assertFailsWith<NotFoundException> { service.streamRewrite(userId, noteId, "Fix", "text") }
        Mockito.verifyNoInteractions(chatClient)
    }

    @Test
    fun `a provider failure ends the stream with a failure event instead of an error`() {
        mockProvider(Flux.concat(Flux.just("partial"), Flux.error(IllegalStateException("provider down"))))

        StepVerifier.create(service.streamRewrite(userId, noteId, "Fix", "text"))
            .expectNext(NoteAiEditEvent.AppendText("partial"))
            .expectNext(NoteAiEditEvent.Failed)
            .verifyComplete()
    }

    @Test
    fun `cancelling the stream cancels the provider call`() {
        val providerCancelled = AtomicBoolean(false)
        mockProvider(Flux.never<String>().doOnCancel { providerCancelled.set(true) })

        StepVerifier.create(service.streamRewrite(userId, noteId, "Fix", "text"))
            .thenCancel()
            .verify()

        assertTrue(providerCancelled.get())
    }

    @Test
    fun `nothing is called on the provider until the stream is subscribed`() {
        mockProvider(Flux.just("ok"))

        service.streamRewrite(userId, noteId, "Fix", "text")

        assertFalse(Mockito.mockingDetails(chatClient).invocations.isNotEmpty())
    }
}
