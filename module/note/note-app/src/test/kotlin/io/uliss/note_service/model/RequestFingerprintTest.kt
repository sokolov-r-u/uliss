package io.uliss.note_service.model

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class RequestFingerprintTest {

    @Test
    fun `fingerprints compare by value`() {
        val first = RequestFingerprint.from(ByteArray(32) { it.toByte() })
        val second = RequestFingerprint.from(ByteArray(32) { it.toByte() })

        assertEquals(first, second)
        assertEquals(first.hashCode(), second.hashCode())
    }

    @Test
    fun `fingerprint copies mutable input`() {
        val source = ByteArray(32) { it.toByte() }
        val fingerprint = RequestFingerprint.from(source)

        source[0] = 99

        assertEquals(RequestFingerprint.from(ByteArray(32) { it.toByte() }), fingerprint)
    }

    @Test
    fun `fingerprint requires SHA-256 length`() {
        assertFailsWith<IllegalArgumentException> {
            RequestFingerprint.from(ByteArray(31))
        }
    }
}
