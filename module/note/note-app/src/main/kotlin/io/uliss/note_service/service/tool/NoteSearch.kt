package io.uliss.note_service.service.tool

import io.uliss.note_service.repository.RetrievedChunk

/** Semantic search over one user's notes; the caller binds the user and the notes to leave out. */
fun interface NoteSearch {
    fun search(query: String, limit: Int, minSimilarity: Double): List<RetrievedChunk>
}
