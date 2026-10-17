package io.uliss.note_service.util

import net.jqwik.api.Arbitraries
import net.jqwik.api.Arbitrary
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.Provide
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class AudioFormatDetectorTest {

    @Test
    fun `browser recorder types with codec parameters are recognised`() {
        assertEquals(AudioFormat.WEBM, AudioFormatDetector.detect("audio/webm;codecs=opus", WEBM_HEAD))
        assertEquals(AudioFormat.OGG, AudioFormatDetector.detect("audio/ogg; codecs=opus", OGG_HEAD))
        assertEquals(AudioFormat.MP4, AudioFormatDetector.detect("AUDIO/MP4", MP4_HEAD))
    }

    @Test
    fun `a declared type that does not match the signature is refused`() {
        assertNull(AudioFormatDetector.detect("audio/webm", OGG_HEAD))
        assertNull(AudioFormatDetector.detect("audio/mp4", WEBM_HEAD))
    }

    @Test
    fun `a missing or unlisted type is refused even with a valid signature`() {
        assertNull(AudioFormatDetector.detect(null, WEBM_HEAD))
        assertNull(AudioFormatDetector.detect("audio/mpeg", WEBM_HEAD))
        assertNull(AudioFormatDetector.detect("application/octet-stream", OGG_HEAD))
    }

    @Test
    fun `content shorter than the signature is refused`() {
        assertNull(AudioFormatDetector.detect("audio/webm", WEBM_HEAD.copyOf(3)))
        assertNull(AudioFormatDetector.detect("audio/mp4", MP4_HEAD.copyOf(7)))
        assertNull(AudioFormatDetector.detect("audio/ogg", ByteArray(0)))
    }

    @Property
    fun `a valid signature is accepted whatever follows it`(
        @ForAll("formats") format: AudioFormat,
        @ForAll tail: ByteArray,
    ) {
        assertEquals(format, AudioFormatDetector.detect(format.mimeType, headOf(format) + tail))
    }

    @Property
    fun `random bytes are never taken for audio`(
        @ForAll("formats") format: AudioFormat,
        @ForAll("nonAudio") content: ByteArray,
    ) {
        assertNull(AudioFormatDetector.detect(format.mimeType, content))
    }

    @Provide
    fun formats(): Arbitrary<AudioFormat> = Arbitraries.of(*AudioFormat.entries.toTypedArray())

    @Provide
    fun nonAudio(): Arbitrary<ByteArray> = Arbitraries.bytes().array(ByteArray::class.java).ofMaxSize(64)
        .filter { bytes -> AudioFormat.entries.none { startsWithSignature(bytes, it) } }

    private fun startsWithSignature(bytes: ByteArray, format: AudioFormat): Boolean {
        val head = headOf(format)
        val offset = if (format == AudioFormat.MP4) 4 else 0
        return bytes.size >= head.size &&
            (offset until head.size).all { bytes[it] == head[it] }
    }

    private fun headOf(format: AudioFormat): ByteArray = when (format) {
        AudioFormat.WEBM -> WEBM_HEAD
        AudioFormat.OGG -> OGG_HEAD
        AudioFormat.MP4 -> MP4_HEAD
    }

    private companion object {
        val WEBM_HEAD = byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte())
        val OGG_HEAD = "OggS".toByteArray()
        val MP4_HEAD = byteArrayOf(0, 0, 0, 0x1C) + "ftyp".toByteArray()
    }
}
