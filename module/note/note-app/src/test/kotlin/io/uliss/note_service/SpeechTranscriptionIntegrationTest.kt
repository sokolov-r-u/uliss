package io.uliss.note_service

import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.ai.audio.transcription.AudioTranscription
import org.springframework.ai.audio.transcription.AudioTranscriptionPrompt
import org.springframework.ai.audio.transcription.AudioTranscriptionResponse
import org.springframework.ai.audio.transcription.TranscriptionModel
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import java.util.UUID
import kotlin.test.assertEquals

class SpeechTranscriptionIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc


    private val user = jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) }

    private fun webm(size: Int) = byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte()) + ByteArray(size - 4)

    private fun upload(content: ByteArray, type: String = "audio/webm;codecs=opus") =
        mockMvc.multipart("/note/speech/transcriptions") {
            file(MockMultipartFile("audio", "blob", type, content))
            with(user)
        }

    @Test
    fun `a dictated recording is transcribed through the configured model`() {
        Mockito.`when`(transcriptionModel.call(anyValue<AudioTranscriptionPrompt>()))
            .thenReturn(AudioTranscriptionResponse(AudioTranscription(" Купить молоко ")))

        upload(webm(512)).andExpect {
            status { isOk() }
            jsonPath("$.text") { value("Купить молоко") }
        }

        val prompt = ArgumentCaptor.forClass(AudioTranscriptionPrompt::class.java)
        Mockito.verify(transcriptionModel).call(prompt.captureValue())
        assertEquals("audio.webm", prompt.value.instructions.filename)
    }

    @Test
    fun `a file that is not audio never reaches the model`() {
        upload("<html>".toByteArray(), "audio/webm").andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("UNSUPPORTED_AUDIO") }
        }
        Mockito.verifyNoInteractions(transcriptionModel)
    }

    @Test
    fun `a recording over the configured size is refused with its own code`() {
        upload(webm(1025)).andExpect {
            status { isPayloadTooLarge() }
            jsonPath("$.code") { value("AUDIO_TOO_LARGE") }
        }
        Mockito.verifyNoInteractions(transcriptionModel)
    }

    @Test
    fun `a body over the multipart limit is refused before the controller`() {
        upload(webm(4096)).andExpect { status { isPayloadTooLarge() } }
        Mockito.verifyNoInteractions(transcriptionModel)
    }

    @Test
    fun `an anonymous upload is rejected`() {
        mockMvc.multipart("/note/speech/transcriptions") {
            file(MockMultipartFile("audio", "blob", "audio/webm", webm(64)))
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `settings report the configured recording length`() {
        mockMvc.get("/note/speech/settings") { with(user) }.andExpect {
            status { isOk() }
            jsonPath("$.maxDurationSeconds") { value(90) }
        }
    }
}
