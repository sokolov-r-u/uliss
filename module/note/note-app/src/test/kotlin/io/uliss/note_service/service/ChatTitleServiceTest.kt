package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.util.ChatTitlePrompts
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.boot.test.system.CapturedOutput
import org.springframework.boot.test.system.OutputCaptureExtension
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@ExtendWith(OutputCaptureExtension::class)
class ChatTitleServiceTest {

    private val chatClient = Mockito.mock(ChatClient::class.java)
    private val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
    private val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
    private val chatService = Mockito.mock(ChatService::class.java)
    private val service = ChatTitleService(
        chatClient,
        chatService,
        ChatTitleProperties(
            reasoningEffort = "low", verbosity = "low", maxInputChars = 20, timeout = Duration.ofMillis(200),
        ),
    )
    private val chatId = UUID.randomUUID()
    private val userId = UUID.randomUUID()

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
    fun `a blank answer gives no title and is logged with the chat id but never the message`(output: CapturedOutput) {
        stubModel("  \n ")

        assertNull(service.findTitle(chatId, "Secret plans for drop D"))

        assertTrue(output.out.contains("WARN") && output.out.contains("chat=$chatId"))
        assertFalse(output.out.contains("Secret plans"))
    }

    @Test
    fun `a failing provider is logged with the chat id but never the message`(output: CapturedOutput) {
        stubModel("unused")
        Mockito.`when`(requestSpec.call()).thenThrow(IllegalStateException("provider down"))

        service.findTitle(chatId, "Secret plans for drop D")

        assertTrue(output.out.contains("chat=$chatId"))
        assertFalse(output.out.contains("Secret plans"))
    }

    @Test
    fun `a generated title is stored on the chat and then emitted`() {
        stubModel("# Drop D tuning")
        Mockito.`when`(chatService.applyGeneratedTitle(userId, chatId, "Drop D tuning")).thenReturn(true)

        val title = service.generateTitle(userId, chatId, "Tune to drop D?").block(Duration.ofSeconds(5))

        assertEquals("Drop D tuning", title)
        Mockito.verify(chatService).applyGeneratedTitle(userId, chatId, "Drop D tuning")
    }

    @Test
    fun `a title that comes after the timeout is neither stored nor emitted`() {
        val late = CountDownLatch(1)
        stubModel("unused")
        Mockito.`when`(callResponseSpec.content()).thenAnswer {
            late.await(5, TimeUnit.SECONDS)
            "Late title"
        }

        val title = service.generateTitle(userId, chatId, "Tune to drop D?").block(Duration.ofSeconds(5))
        late.countDown()

        assertNull(title)
        Mockito.verify(chatService, Mockito.after(500).never()).applyGeneratedTitle(anyValue(), anyValue(), anyValue())
    }

    @Test
    fun `the title is generated and stored even when nobody listens to the stream`() {
        stubModel("Drop D tuning")
        val stored = CountDownLatch(1)
        Mockito.`when`(chatService.applyGeneratedTitle(userId, chatId, "Drop D tuning")).thenAnswer {
            stored.countDown()
            true
        }

        service.generateTitle(userId, chatId, "Tune to drop D?")

        assertTrue(stored.await(5, TimeUnit.SECONDS))
    }

    @Test
    fun `inside a transaction the model is called only after it commits, so the chat row is visible`() {
        stubModel("Drop D tuning")
        Mockito.`when`(chatService.applyGeneratedTitle(userId, chatId, "Drop D tuning")).thenReturn(true)
        TransactionSynchronizationManager.initSynchronization()
        try {
            val title = service.generateTitle(userId, chatId, "Tune to drop D?")
            Mockito.verifyNoInteractions(chatClient)

            TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCommit() }

            assertEquals("Drop D tuning", title.block(Duration.ofSeconds(5)))
            Mockito.verify(chatClient, Mockito.times(1)).prompt()
        } finally {
            TransactionSynchronizationManager.clearSynchronization()
        }
    }

    @Test
    fun `a title that cannot be stored ends the title empty instead of failing the reply stream`() {
        stubModel("Drop D tuning")
        Mockito.`when`(chatService.applyGeneratedTitle(userId, chatId, "Drop D tuning"))
            .thenThrow(IllegalStateException("database down"))

        assertNull(service.generateTitle(userId, chatId, "Tune to drop D?").block(Duration.ofSeconds(5)))
    }

    @Test
    fun `a chat the user renamed meanwhile keeps its title and nothing is emitted`() {
        stubModel("Drop D tuning")
        Mockito.`when`(chatService.applyGeneratedTitle(userId, chatId, "Drop D tuning")).thenReturn(false)

        assertNull(service.generateTitle(userId, chatId, "Tune to drop D?").block(Duration.ofSeconds(5)))
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
