package io.uliss.note_service.util

import io.uliss.note_service.model.projection.RequestFingerprint
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/** SHA-256 of a manual note's create request body; a retry under the same key must carry the same one. */
object ManualNoteFingerprint {

    private const val FORMAT_VERSION = 1

    fun of(title: String, content: String, icon: String?): RequestFingerprint {
        val bytes = ByteArrayOutputStream()
        DataOutputStream(bytes).use { out ->
            out.writeByte(FORMAT_VERSION)
            out.writeField(title)
            out.writeField(content)
            // the flag keeps no icon apart from an empty one
            out.writeBoolean(icon != null)
            out.writeField(icon.orEmpty())
        }
        return RequestFingerprint.from(MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()))
    }

    // length-prefixed, so text moved from one field to the next changes the bytes
    private fun DataOutputStream.writeField(value: String) {
        val utf8 = value.toByteArray(StandardCharsets.UTF_8)
        writeInt(utf8.size)
        write(utf8)
    }
}
