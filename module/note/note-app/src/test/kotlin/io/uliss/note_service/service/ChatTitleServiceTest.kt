package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.util.ChatTitlePrompts
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ChatTitleServiceTest {

    private val chatClient = Mockito.mock(ChatClient::class.java)
    private val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
    private val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
    private val service = ChatTitleService(
        chatClient,
        ChatTitleProperties(reasoningEffort = "low", verbosity = "low", maxInputChars = 20),
    )
    private val chatId = UUID.randomUUID()

    @Test
    fun `the first message goes to the model with the title prompt and per-call options`() {
        stubModel("Drop D tuning")

        val title = service.findTitle(chatId, "Tune to drop D?")

        assertEquals("Drop D tuning", title)
        Mockito.verify(requestSpec).system(ChatTitlePrompts.SYSTEM_PROMPT)
        Mockito.verify(requestSpec).user("Tune to drop D?")
        val options = ArgumentCaptor.forClass(OpenAiChatOptions.Builder::class.java)
        Mockito.verify(requestSpec).options(options.capture())
        val built = options.value.build()
        assertEquals("low", built.reasoningEffort)
        assertEquals("low", built.verbosity)
    }

    @Test
    fun `only the start of a long message goes to the model, never splitting a character`() {
        stubModel("Title")

        service.findTitle(chatId, "a".repeat(19) + "😀" + "tail after the limit")

        Mockito.verify(requestSpec).user("a".repeat(19) + "😀")
    }

    @Test
    fun `the model's title is cleaned like a note title`() {
        stubModel("# «Drop D tuning»\nSecond line")

        assertEquals("Drop D tuning", service.findTitle(chatId, "Tune to drop D?"))
    }

    @Test
    fun `a failing provider leaves the chat without a generated title instead of failing the caller`() {
        stubModel("unused")
        Mockito.`when`(requestSpec.call()).thenThrow(IllegalStateException("provider down"))

        assertNull(service.findTitle(chatId, "Tune to drop D?"))
    }

    @Test
    fun `a blank answer gives no title`() {
        stubModel("  \n ")

        assertNull(service.findTitle(chatId, "Tune to drop D?"))
    }

    private fun stubModel(answer: String?) {
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.content()).thenReturn(answer)
    }
}
