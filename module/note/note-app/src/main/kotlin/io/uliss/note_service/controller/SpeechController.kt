package io.uliss.note_service.controller

import io.uliss.note_service.dto.response.SpeechSettingsResponse
import io.uliss.note_service.dto.response.TranscriptionResponse
import io.uliss.note_service.service.SpeechTranscriptionService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile

@RestController
@RequestMapping("/speech")
class SpeechController(
    private val speechTranscriptionService: SpeechTranscriptionService,
) {

    @GetMapping("/settings")
    fun getSettings(): SpeechSettingsResponse =
        SpeechSettingsResponse(speechTranscriptionService.getMaxDurationSeconds())

    /** A missing part is the service's refusal too, so every bad recording answers `UNSUPPORTED_AUDIO`. */
    @PostMapping("/transcriptions", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun transcribe(@RequestPart("audio", required = false) audio: MultipartFile?): TranscriptionResponse =
        TranscriptionResponse(speechTranscriptionService.transcribe(audio?.bytes ?: ByteArray(0), audio?.contentType))
}
