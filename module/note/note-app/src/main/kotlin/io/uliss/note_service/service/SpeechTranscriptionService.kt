package io.uliss.note_service.service

import io.uliss.logging.annotation.Sensitive
import io.uliss.note_service.exception.AudioTooLargeException
import io.uliss.note_service.exception.TooManyTranscriptionsException
import io.uliss.note_service.exception.TranscriptionFailedException
import io.uliss.note_service.exception.UnsupportedAudioException
import io.uliss.note_service.util.AudioFormatDetector
import org.springframework.ai.audio.transcription.AudioTranscriptionPrompt
import org.springframework.ai.audio.transcription.TranscriptionModel
import org.springframework.core.io.ByteArrayResource
import org.springframework.core.io.Resource
import org.springframework.stereotype.Service
import java.util.concurrent.Semaphore

/** Turns one dictated recording into text; the audio is neither decoded, stored nor logged here. */
@Service
class SpeechTranscriptionService(
    private val transcriptionModel: TranscriptionModel,
    private val properties: SpeechProperties,
) {
    private val inFlight = Semaphore(properties.maxConcurrent)

    fun getMaxDurationSeconds(): Long = properties.maxDuration.toSeconds()

    /**
     * Returns the trimmed text, empty for silence; refusals are thrown before the provider is called. The size is
     * checked from the recording's declared length, before its bytes are read into memory. A missing recording is
     * refused like an empty one. At most [SpeechProperties.maxConcurrent] recordings are in memory at once; one more
     * is refused at once, not queued.
     */
    fun transcribe(@Sensitive recording: Resource?, contentType: String?): String {
        val size = recording?.contentLength() ?: 0
        if (recording == null || size == 0L) throw UnsupportedAudioException()
        if (size > properties.maxFileSize.toBytes()) throw AudioTooLargeException()
        // after the refusals above, which no retry can help: a refused recording must not be told to try again
        if (!inFlight.tryAcquire()) throw TooManyTranscriptionsException()
        try {
            return readAndTranscribe(recording, contentType)
        } finally {
            inFlight.release()
        }
    }

    private fun readAndTranscribe(recording: Resource, contentType: String?): String {
        val audio = recording.contentAsByteArray
        val format = AudioFormatDetector.detect(contentType, audio) ?: throw UnsupportedAudioException()
        val file = object : ByteArrayResource(audio) {
            override fun getFilename(): String = "audio.${format.extension}"
        }
        val text = try {
            transcriptionModel.call(AudioTranscriptionPrompt(file)).result?.output
        } catch (ex: RuntimeException) {
            // logged once, with the cause, by the exception handler
            throw TranscriptionFailedException(ex)
        }
        return text?.trim().orEmpty()
    }
}
