package io.uliss.note_service.controller

import io.uliss.exception.handler.GlobalExceptionHandler
import io.uliss.note_service.anyValue
import io.uliss.note_service.exception.AudioTooLargeException
import io.uliss.note_service.exception.TranscriptionFailedException
import io.uliss.note_service.exception.UnsupportedAudioException
import io.uliss.note_service.service.SpeechTranscriptionService
import io.uliss.security.config.CorsProperties
import io.uliss.security.config.OnboardingGuardConfig
import io.uliss.security.config.SecurityConfig
import io.uliss.security.config.WebMvcPathPrefixConfig
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import java.util.UUID

@WebMvcTest(SpeechController::class)
@Import(
    SecurityConfig::class,
    CorsProperties::class,
    WebMvcPathPrefixConfig::class,
    OnboardingGuardConfig::class,
    GlobalExceptionHandler::class,
)
class SpeechControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockitoBean
    lateinit var speechTranscriptionService: SpeechTranscriptionService

    @MockitoBean
    lateinit var jwtDecoder: JwtDecoder

    private val audio = byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte(), 1, 2)

    private fun transcribe(part: MockMultipartFile? = MockMultipartFile("audio", "blob", "audio/webm", audio)) =
        mockMvc.multipart("/note/speech/transcriptions") {
            part?.let { file(it) }
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) })
        }

    private fun stubFailure(ex: RuntimeException) {
        Mockito.doThrow(ex).`when`(speechTranscriptionService).transcribe(anyValue(), anyValue())
    }

    @Test
    fun `the recording and its declared type reach the service and the text comes back`() {
        Mockito.`when`(speechTranscriptionService.transcribe(audio, "audio/webm")).thenReturn("Привет")

        transcribe().andExpect {
            status { isOk() }
            jsonPath("$.text") { value("Привет") }
        }
    }

    @Test
    fun `a request without the audio part is refused as unsupported audio`() {
        Mockito.`when`(speechTranscriptionService.transcribe(ByteArray(0), null))
            .thenThrow(UnsupportedAudioException())

        transcribe(part = null).expectError(400, "UNSUPPORTED_AUDIO")
    }

    @Test
    fun `refusals and provider failures map to their codes`() {
        stubFailure(UnsupportedAudioException())
        transcribe().expectError(400, "UNSUPPORTED_AUDIO")

        stubFailure(AudioTooLargeException())
        transcribe().expectError(413, "AUDIO_TOO_LARGE")

        stubFailure(TranscriptionFailedException(IllegalStateException("provider")))
        transcribe().expectError(502, "TRANSCRIPTION_FAILED")
    }

    @Test
    fun `an unauthenticated recording is rejected with 401`() {
        mockMvc.multipart("/note/speech/transcriptions") {
            file(MockMultipartFile("audio", "blob", "audio/webm", audio))
        }.andExpect { status { isUnauthorized() } }
        Mockito.verifyNoInteractions(speechTranscriptionService)
    }

    @Test
    fun `settings report the recording length limit`() {
        Mockito.`when`(speechTranscriptionService.getMaxDurationSeconds()).thenReturn(300)

        mockMvc.get("/note/speech/settings") {
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$.maxDurationSeconds") { value(300) }
        }
    }

    private fun ResultActionsDsl.expectError(status: Int, code: String) = andExpect {
        status { isEqualTo(status) }
        jsonPath("$.code") { value(code) }
    }
}
