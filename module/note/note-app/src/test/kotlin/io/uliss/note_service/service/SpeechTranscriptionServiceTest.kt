package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.captureValue
import io.uliss.note_service.exception.AudioTooLargeException
import io.uliss.note_service.exception.TooManyTranscriptionsException
import io.uliss.note_service.exception.TranscriptionFailedException
import io.uliss.note_service.exception.UnsupportedAudioException
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.ai.audio.transcription.AudioTranscription
import org.springframework.ai.audio.transcription.AudioTranscriptionPrompt
import org.springframework.ai.audio.transcription.AudioTranscriptionResponse
import org.springframework.ai.audio.transcription.TranscriptionModel
import org.springframework.core.io.ByteArrayResource
import org.springframework.core.io.Resource
import org.springframework.util.unit.DataSize
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

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

        val text = service.transcribe(recording(audio), "audio/webm;codecs=opus")

        assertEquals("Привет, mixed English", text)
        val prompt = ArgumentCaptor.forClass(AudioTranscriptionPrompt::class.java)
        Mockito.verify(model).call(prompt.captureValue())
        assertEquals("audio.webm", prompt.value.instructions.filename)
        assertContentEquals(audio, prompt.value.instructions.contentAsByteArray)
    }

    @Test
    fun `an mp4 recording is named for its container`() {
        stubModel("text")

        service.transcribe(recording(MP4_HEAD), "audio/mp4")

        val prompt = ArgumentCaptor.forClass(AudioTranscriptionPrompt::class.java)
        Mockito.verify(model).call(prompt.captureValue())
        assertEquals("audio.mp4", prompt.value.instructions.filename)
    }

    @Test
    fun `silence comes back as empty text`() {
        stubModel(" \n ")

        assertEquals("", service.transcribe(recording(OGG_HEAD), "audio/ogg"))
    }

    @Test
    fun `an empty recording is refused without calling the model`() {
        assertFailsWith<UnsupportedAudioException> { service.transcribe(recording(ByteArray(0)), "audio/webm") }
        Mockito.verifyNoInteractions(model)
    }

    @Test
    fun `a recording whose bytes are not the declared audio is refused without calling the model`() {
        assertFailsWith<UnsupportedAudioException> { service.transcribe(recording("not audio".toByteArray()), "audio/webm") }
        assertFailsWith<UnsupportedAudioException> { service.transcribe(recording(OGG_HEAD), "text/plain") }
        Mockito.verifyNoInteractions(model)
    }

    @Test
    fun `a recording over the size limit is refused without calling the model`() {
        stubModel("fits")
        assertEquals("fits", service.transcribe(recording(WEBM_HEAD + ByteArray(60)), "audio/webm"))

        assertFailsWith<AudioTooLargeException> { service.transcribe(recording(WEBM_HEAD + ByteArray(61)), "audio/webm") }
        Mockito.verify(model, Mockito.times(1)).call(anyValue<AudioTranscriptionPrompt>())
    }

    @Test
    fun `a recording over the size limit is refused by its declared length, without reading it`() {
        val unreadable = object : ByteArrayResource(ByteArray(0)) {
            override fun contentLength(): Long = 65
            override fun getContentAsByteArray(): ByteArray = error("must not be read into memory")
        }

        assertFailsWith<AudioTooLargeException> { service.transcribe(unreadable, "audio/webm") }
    }

    @Test
    fun `a recording beyond the concurrent limit is refused without being read or sent`() {
        val single = SpeechTranscriptionService(model, SpeechProperties(maxConcurrent = 1))
        val providerEntered = CountDownLatch(1)
        val providerMayAnswer = CountDownLatch(1)
        Mockito.`when`(model.call(anyValue<AudioTranscriptionPrompt>())).thenAnswer {
            providerEntered.countDown()
            providerMayAnswer.await(5, TimeUnit.SECONDS)
            AudioTranscriptionResponse(AudioTranscription("first"))
        }
        val first = CompletableFuture.supplyAsync { single.transcribe(recording(WEBM_HEAD), "audio/webm") }
        val unreadable = object : ByteArrayResource(ByteArray(0)) {
            override fun contentLength(): Long = 4
            override fun getContentAsByteArray(): ByteArray = error("must not be read into memory")
        }

        try {
            assertTrue(providerEntered.await(5, TimeUnit.SECONDS), "the first recording never reached the provider")
            assertFailsWith<TooManyTranscriptionsException> { single.transcribe(unreadable, "audio/webm") }
        } finally {
            // a failed assertion must not leave the first call blocked
            providerMayAnswer.countDown()
        }
        assertEquals("first", first.get(5, TimeUnit.SECONDS))
        Mockito.verify(model, Mockito.times(1)).call(anyValue<AudioTranscriptionPrompt>())
    }

    @Test
    fun `a finished transcription frees its place, whether it succeeded, failed or was refused`() {
        val single = SpeechTranscriptionService(model, SpeechProperties(maxConcurrent = 1))
        Mockito.`when`(model.call(anyValue<AudioTranscriptionPrompt>()))
            .thenReturn(AudioTranscriptionResponse(AudioTranscription("one")))
            .thenThrow(IllegalStateException("503"))
            .thenReturn(AudioTranscriptionResponse(AudioTranscription("four")))

        assertEquals("one", single.transcribe(recording(WEBM_HEAD), "audio/webm"))
        assertFailsWith<TranscriptionFailedException> { single.transcribe(recording(WEBM_HEAD), "audio/webm") }
        assertFailsWith<UnsupportedAudioException> { single.transcribe(recording("not audio".toByteArray()), "audio/webm") }
        assertEquals("four", single.transcribe(recording(WEBM_HEAD), "audio/webm"))
    }

    @Test
    fun `a provider failure is reported as a transcription failure`() {
        Mockito.`when`(model.call(anyValue<AudioTranscriptionPrompt>())).thenThrow(IllegalStateException("503"))

        val ex = assertFailsWith<TranscriptionFailedException> { service.transcribe(recording(WEBM_HEAD), "audio/webm") }
        assertEquals("503", ex.cause?.message)
    }

    @Test
    fun `a concurrent limit below one is refused at startup instead of refusing every recording`() {
        assertFailsWith<IllegalArgumentException> { SpeechProperties(maxConcurrent = 0) }
    }

    @Test
    fun `the recording length limit is exposed in whole seconds`() {
        assertEquals(300, service.getMaxDurationSeconds())
    }

    private fun recording(bytes: ByteArray): Resource = ByteArrayResource(bytes)

    private companion object {
        val WEBM_HEAD = byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte())
        val OGG_HEAD = "OggS".toByteArray()
        val MP4_HEAD = byteArrayOf(0, 0, 0, 0x1C) + "ftyp".toByteArray()
    }
}
