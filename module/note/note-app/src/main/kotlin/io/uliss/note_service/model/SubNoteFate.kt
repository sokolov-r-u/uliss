package io.uliss.note_service.model

/** What happens to the sub-notes of a deleted note. */
enum class SubNoteFate {
    /** They take the deleted note's place: its parent, or a copy of its constellations. */
    KEEP,

    /** They are deleted with it, the whole subtree. */
    DELETE,
}
