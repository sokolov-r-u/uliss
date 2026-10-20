package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.SkyNote
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.model.projection.SkyNoteRow
import java.util.UUID

/**
 * Which notes are stars and where they hang. A star is a `READY` note with a title. A note that is not a star drops
 * out of the sky but keeps its sub-notes up: they hang under the nearest star above them, and a star with no star
 * above it carries the memberships of its top note, so it still lives where that note lives.
 */
object SkyNotes {

    fun stars(rows: List<SkyNoteRow>, memberships: Map<UUID, List<NoteMembership>>): List<SkyNote> {
        val byId = rows.associateBy { it.id }
        return rows
            .filter { isStar(it) }
            .sortedWith(compareBy<SkyNoteRow> { it.createdAt }.thenBy { it.id })
            .map { row ->
                val ancestors = ancestorsOf(row, byId)
                val parent = ancestors.firstOrNull { isStar(it) }
                SkyNote(
                    id = row.id,
                    // isStar guarantees the title
                    title = row.title.orEmpty(),
                    parentNoteId = parent?.id,
                    createdAt = row.createdAt,
                    memberships = if (parent == null) {
                        NotePlacement.ordered(memberships[(ancestors.lastOrNull() ?: row).id].orEmpty())
                    } else {
                        emptyList()
                    },
                )
            }
    }

    private fun isStar(row: SkyNoteRow) = row.status == NoteStatus.READY && !row.title.isNullOrBlank()

    /** Ancestors from the parent up to the top note; a missing parent ends the walk, a corrupted cycle stops it. */
    private fun ancestorsOf(row: SkyNoteRow, byId: Map<UUID, SkyNoteRow>): List<SkyNoteRow> {
        val seen = mutableSetOf(row.id)
        val ancestors = mutableListOf<SkyNoteRow>()
        var current = row.parentNoteId?.let(byId::get)
        while (current != null && seen.add(current.id)) {
            ancestors += current
            current = current.parentNoteId?.let(byId::get)
        }
        return ancestors
    }
}
