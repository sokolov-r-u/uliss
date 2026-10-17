package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.captureValue
import io.uliss.note_service.exception.AudioTooLargeException
import io.uliss.note_service.exception.TranscriptionFailedException
import io.uliss.note_service.exception.UnsupportedAudioException
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.ai.audio.transcription.AudioTranscription
import org.springframework.ai.audio.transcription.AudioTranscriptionPrompt
import org.springframework.ai.audio.transcription.AudioTranscriptionResponse
import org.springframework.ai.audio.transcription.TranscriptionModel
import org.springframework.util.unit.DataSize
import java.time.Duration
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class SpeechTranscriptionServiceTest {

    private val model = Mockito.mock(TranscriptionModel::class.java)
    private val service = SpeechTranscriptionService(
        model,
        SpeechProperties(maxDuration = Duration.ofMinutes(5), maxFileSize = DataSize.ofBytes(64)),
    )

    private fun stubModel(text: String) {
        Mockito.`when`(model.call(anyValue<AudioTranscriptionPrompt>()))
            .thenReturn(AudioTranscriptionResponse(AudioTranscription(text)))
    }

    @Test
    fun `the recording goes to the model under a file name of its format and the text comes back trimmed`() {
        stubModel("  Привет, mixed English  \n")
        val audio = WEBM_HEAD + ByteArray(10) { it.toByte() }

        val text = service.transcribe(audio, "audio/webm;codecs=opus")

        assertEquals("Привет, mixed English", text)
        val prompt = ArgumentCaptor.forClass(AudioTranscriptionPrompt::class.java)
        Mockito.verify(model).call(prompt.captureValue())
        assertEquals("audio.webm", prompt.value.instructions.filename)
        assertContentEquals(audio, prompt.value.instructions.contentAsByteArray)
    }

    @Test
    fun `an mp4 recording is named for its container`() {
        stubModel("text")

        service.transcribe(MP4_HEAD, "audio/mp4")

        val prompt = ArgumentCaptor.forClass(AudioTranscriptionPrompt::class.java)
        Mockito.verify(model).call(prompt.captureValue())
        assertEquals("audio.mp4", prompt.value.instructions.filename)
    }

    @Test
    fun `silence comes back as empty text`() {
        stubModel(" \n ")

        assertEquals("", service.transcribe(OGG_HEAD, "audio/ogg"))
    }

    @Test
    fun `an empty recording is refused without calling the model`() {
        assertFailsWith<UnsupportedAudioException> { service.transcribe(ByteArray(0), "audio/webm") }
        Mockito.verifyNoInteractions(model)
    }

    @Test
    fun `a recording whose bytes are not the declared audio is refused without calling the model`() {
        assertFailsWith<UnsupportedAudioException> { service.transcribe("not audio".toByteArray(), "audio/webm") }
        assertFailsWith<UnsupportedAudioException> { service.transcribe(OGG_HEAD, "text/plain") }
        Mockito.verifyNoInteractions(model)
    }

    @Test
    fun `a recording over the size limit is refused without calling the model`() {
        stubModel("fits")
        assertEquals("fits", service.transcribe(WEBM_HEAD + ByteArray(60), "audio/webm"))

        assertFailsWith<AudioTooLargeException> { service.transcribe(WEBM_HEAD + ByteArray(61), "audio/webm") }
        Mockito.verify(model, Mockito.times(1)).call(anyValue<AudioTranscriptionPrompt>())
    }

    @Test
    fun `a provider failure is reported as a transcription failure`() {
        Mockito.`when`(model.call(anyValue<AudioTranscriptionPrompt>())).thenThrow(IllegalStateException("503"))

        val ex = assertFailsWith<TranscriptionFailedException> { service.transcribe(WEBM_HEAD, "audio/webm") }
        assertEquals("503", ex.cause?.message)
    }

    @Test
    fun `the recording length limit is exposed in whole seconds`() {
        assertEquals(300, service.getMaxDurationSeconds())
    }

    private companion object {
        val WEBM_HEAD = byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte())
        val OGG_HEAD = "OggS".toByteArray()
        val MP4_HEAD = byteArrayOf(0, 0, 0, 0x1C) + "ftyp".toByteArray()
    }
}
