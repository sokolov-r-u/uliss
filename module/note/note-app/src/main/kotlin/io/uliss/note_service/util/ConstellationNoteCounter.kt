package io.uliss.note_service.util

import io.uliss.note_service.model.projection.ConstellationNoteCount
import java.util.UUID

/**
 * Note counts of a constellation tree from its parent links and the placed notes: every placement adds its note to
 * the constellation and each ancestor, so a note placed twice in one subtree counts once there. Work is placements ×
 * depth in memory; the database only reads two flat lists.
 */
object ConstellationNoteCounter {

    /** [parents] maps each constellation to its parent (null for a root); [placements] are (note, constellation). */
    fun count(parents: Map<UUID, UUID?>, placements: Collection<Pair<UUID, UUID>>): List<ConstellationNoteCount> {
        val subtreeNotes = HashMap<UUID, MutableSet<UUID>>()
        val ownNotes = HashMap<UUID, MutableSet<UUID>>()
        for ((noteId, constellationId) in placements) {
            if (constellationId !in parents) continue
            ownNotes.getOrPut(constellationId, ::HashSet).add(noteId)
            var current: UUID? = constellationId
            var steps = 0
            while (current != null) {
                // already counted here: every ancestor above has it too
                if (!subtreeNotes.getOrPut(current, ::HashSet).add(noteId)) break
                check(++steps <= parents.size) { "constellation id=$constellationId is on a cycle" }
                current = parents[current]
            }
        }
        return subtreeNotes.map { (id, notes) -> ConstellationNoteCount(id, notes.size, ownNotes[id]?.size ?: 0) }
    }
}
