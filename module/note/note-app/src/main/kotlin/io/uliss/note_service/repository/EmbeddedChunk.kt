package io.uliss.note_service.repository

class EmbeddedChunk(
    val index: Int,
    val content: String,
    val metadata: Map<String, Any>,
    val embedding: FloatArray,
)
