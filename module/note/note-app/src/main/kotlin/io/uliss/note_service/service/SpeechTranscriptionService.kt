package io.uliss.note_service.service

import io.uliss.logging.annotation.Sensitive
import io.uliss.note_service.exception.AudioTooLargeException
import io.uliss.note_service.exception.TranscriptionFailedException
import io.uliss.note_service.exception.UnsupportedAudioException
import io.uliss.note_service.util.AudioFormatDetector
import org.springframework.ai.audio.transcription.AudioTranscriptionPrompt
import org.springframework.ai.audio.transcription.TranscriptionModel
import org.springframework.core.io.ByteArrayResource
import org.springframework.stereotype.Service

/** Turns one dictated recording into text; the audio is neither decoded, stored nor logged here. */
@Service
class SpeechTranscriptionService(
    private val transcriptionModel: TranscriptionModel,
    private val properties: SpeechProperties,
) {
    fun getMaxDurationSeconds(): Long = properties.maxDuration.toSeconds()

    /** Returns the trimmed text, empty for silence; refusals are thrown before the provider is called. */
    fun transcribe(@Sensitive audio: ByteArray, contentType: String?): String {
        if (audio.isEmpty()) throw UnsupportedAudioException()
        if (audio.size > properties.maxFileSize.toBytes()) throw AudioTooLargeException()
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
