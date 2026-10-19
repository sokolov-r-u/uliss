package io.uliss.note_service.util

import io.uliss.note_service.model.projection.NoteNode
import java.util.Locale
import java.util.UUID

/**
 * Read-only view of one user's notes as a forest: a sub-note hangs under its parent note at any depth. Built from a
 * consistent snapshot; a move that would put a note under itself or its descendant is what [canMoveUnder] refuses.
 */
class NoteHierarchy(private val nodes: Collection<NoteNode>) {
    private val byId = nodes.associateBy { it.id }
    private val childrenById = nodes.filter { it.parentNoteId != null }.groupBy { it.parentNoteId }

    fun find(id: UUID): NoteNode? = byId[id]

    /** The direct sub-notes, newest first. */
    fun childrenOf(id: UUID): List<NoteNode> = childrenById[id].orEmpty().sortedWith(NEWEST_FIRST)

    /** From the top note down to the parent; empty for a top note. */
    fun ancestorsOf(id: UUID): List<NoteNode> {
        val path = ArrayDeque<NoteNode>()
        var current = byId.getValue(id).parentNoteId?.let(byId::getValue)
        while (current != null) {
            check(path.size < nodes.size) { "note id=$id is on a cycle" }
            path.addFirst(current)
            current = current.parentNoteId?.let(byId::getValue)
        }
        return path
    }

    /** The top note whose place the note lives in; the note itself when it has no parent. */
    fun rootOf(id: UUID): NoteNode = ancestorsOf(id).firstOrNull() ?: byId.getValue(id)

    /** [id] with all its descendants. */
    fun subtreeIds(id: UUID): Set<UUID> {
        val found = linkedSetOf(id)
        val queue = ArrayDeque(listOf(id))
        while (queue.isNotEmpty()) {
            childrenById[queue.removeFirst()].orEmpty().forEach { if (found.add(it.id)) queue.addLast(it.id) }
        }
        return found
    }

    /** False when [parentId] is [noteId] or one of its descendants: the move would close a cycle. */
    fun canMoveUnder(noteId: UUID, parentId: UUID): Boolean = parentId !in subtreeIds(noteId)

    /**
     * Titled notes whose title contains [query] regardless of case, leaving out [exclude] with its descendants (the
     * note being moved): titles starting with the query first, then the newest. A blank query finds nothing.
     */
    fun search(query: String, exclude: UUID?, limit: Int): List<NoteNode> {
        val needle = query.trim().lowercase(Locale.ROOT)
        if (needle.isEmpty()) return emptyList()
        val excluded = exclude?.takeIf { it in byId }?.let(::subtreeIds).orEmpty()
        return nodes
            .filter { it.id !in excluded }
            .mapNotNull { node -> node.title?.lowercase(Locale.ROOT)?.takeIf { needle in it }?.let { node to it } }
            .sortedWith(compareBy<Pair<NoteNode, String>> { !it.second.startsWith(needle) }
                .thenComparator { a, b -> NEWEST_FIRST.compare(a.first, b.first) })
            .take(limit)
            .map { it.first }
    }

    private companion object {
        val NEWEST_FIRST = compareByDescending<NoteNode> { it.createdAt }.thenByDescending { it.id }
    }
}
