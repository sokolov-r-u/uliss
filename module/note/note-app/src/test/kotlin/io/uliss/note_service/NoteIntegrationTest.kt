package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import org.junit.jupiter.api.Tag
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.embedding.EmbeddingModel
import org.springframework.ai.audio.transcription.TranscriptionModel
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.context.bean.override.mockito.MockitoBean

/**
 * Base of every full-context test. One set of annotations and mocks gives one cached Spring context for all classes
 * that add nothing of their own, and the AI clients are mocks everywhere, so no test can reach a real provider.
 * Classes that add spies get their own context but share the same database (one container per JVM).
 */
@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
abstract class NoteIntegrationTest {

    @MockitoBean
    protected lateinit var chatClient: ChatClient

    @MockitoBean
    protected lateinit var embeddingModel: EmbeddingModel

    @MockitoBean
    protected lateinit var transcriptionModel: TranscriptionModel
}
