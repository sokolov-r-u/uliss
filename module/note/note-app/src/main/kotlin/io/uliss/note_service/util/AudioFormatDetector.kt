package io.uliss.note_service.util

/** Accepts audio only when the declared type is whitelisted and the leading bytes carry that container's signature. */
object AudioFormatDetector {
    private val WEBM_SIGNATURE = byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte())
    private val OGG_SIGNATURE = "OggS".toByteArray(Charsets.US_ASCII)
    private val MP4_SIGNATURE = "ftyp".toByteArray(Charsets.US_ASCII)
    private const val MP4_SIGNATURE_OFFSET = 4

    fun detect(contentType: String?, content: ByteArray): AudioFormat? {
        val baseType = contentType?.substringBefore(';')?.trim()?.lowercase() ?: return null
        val format = AudioFormat.entries.firstOrNull { it.mimeType == baseType } ?: return null
        return format.takeIf { hasSignature(it, content) }
    }

    private fun hasSignature(format: AudioFormat, content: ByteArray): Boolean = when (format) {
        AudioFormat.WEBM -> content.startsWith(WEBM_SIGNATURE, 0)
        AudioFormat.OGG -> content.startsWith(OGG_SIGNATURE, 0)
        AudioFormat.MP4 -> content.startsWith(MP4_SIGNATURE, MP4_SIGNATURE_OFFSET)
    }

    private fun ByteArray.startsWith(signature: ByteArray, offset: Int): Boolean =
        size >= offset + signature.size && signature.indices.all { this[offset + it] == signature[it] }
}
