package io.uliss.note_service.model

import java.time.Instant
import java.util.UUID

enum class ChatTurnStatus {
    GENERATING,
    COMPLETE,
    PARTIAL,
    FAILED,
    CANCELED,
}

class RequestFingerprint private constructor(bytes: ByteArray) {
    private val bytes = bytes.copyOf()

    internal fun toByteArray(): ByteArray = bytes.copyOf()

    override fun equals(other: Any?): Boolean =
        this === other || other is RequestFingerprint && bytes.contentEquals(other.bytes)

    override fun hashCode(): Int = bytes.contentHashCode()

    override fun toString(): String = "RequestFingerprint(SHA-256)"

    companion object {
        private const val SHA_256_BYTES = 32

        fun from(bytes: ByteArray): RequestFingerprint {
            require(bytes.size == SHA_256_BYTES) { "SHA-256 fingerprint must contain $SHA_256_BYTES bytes" }
            return RequestFingerprint(bytes)
        }
    }
}

/** Database-backed lifecycle for one user intent and its assistant result. */
data class ChatTurn(
    val id: UUID,
    val userId: UUID,
    val chatId: UUID,
    val idempotencyKey: UUID,
    val requestFingerprint: RequestFingerprint,
    val status: ChatTurnStatus,
    val attempt: Int,
    val leaseUntil: Instant?,
    val retryAfterMs: Long,
)
