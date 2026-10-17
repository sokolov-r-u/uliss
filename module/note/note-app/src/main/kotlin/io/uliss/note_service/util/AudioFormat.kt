package io.uliss.note_service.util

/** Containers a browser `MediaRecorder` produces; [extension] names the file so the provider picks the decoder. */
enum class AudioFormat(val mimeType: String, val extension: String) {
    WEBM("audio/webm", "webm"),
    OGG("audio/ogg", "ogg"),
    MP4("audio/mp4", "mp4"),
}
