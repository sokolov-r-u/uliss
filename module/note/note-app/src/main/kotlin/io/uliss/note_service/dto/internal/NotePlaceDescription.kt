package io.uliss.note_service.dto.internal

/**
 * A note's place as the summary prompts show it: the full name path (root first) of every constellation of its top
 * note, main first, and the titles of its parent notes from the top one down (null for an untitled parent).
 */
data class NotePlaceDescription(
    val constellationPaths: List<List<String>>,
    val parentNoteTitles: List<String?>,
)
