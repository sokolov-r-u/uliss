package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.model.projection.NoteNode
import io.uliss.note_service.repository.NoteHierarchyStore
import org.mockito.Mockito
import java.time.Instant
import java.util.UUID

/**
 * A [NoteHierarchyStore] mock backed by a map, so service tests see their own writes; deleting a note also drops its
 * memberships from [memberships], as the FK cascade does.
 */
class InMemoryNoteHierarchyStore(private val memberships: InMemoryNoteConstellationStore) {
    val nodes = linkedMapOf<UUID, NoteNode>()
    private val owners = mutableMapOf<UUID, UUID>()
    val store: NoteHierarchyStore = Mockito.mock(NoteHierarchyStore::class.java)

    init {
        Mockito.`when`(store.findNodes(anyValue())).thenAnswer { invocation ->
            val userId = invocation.getArgument<UUID>(0)
            nodes.values.filter { owners[it.id] == userId }
        }
        Mockito.`when`(store.setParent(anyValue(), anyValue(), Mockito.any())).thenAnswer { invocation ->
            val userId = invocation.getArgument<UUID>(0)
            val parentId = invocation.getArgument<UUID?>(2)
            invocation.getArgument<Collection<UUID>>(1).filter { owners[it] == userId }.forEach { id ->
                nodes[id] = nodes.getValue(id).copy(parentNoteId = parentId)
            }
        }
        Mockito.`when`(store.deleteNotes(anyValue(), anyValue())).thenAnswer { invocation ->
            val userId = invocation.getArgument<UUID>(0)
            val ids = invocation.getArgument<Collection<UUID>>(1).filter { owners[it] == userId }
            ids.forEach { id ->
                nodes.remove(id)
                memberships.put(userId, id, emptyList())
            }
            check(nodes.values.none { it.parentNoteId in ids }) { "a sub-note would point at a deleted parent" }
        }
    }

    /** Adds a note of [userId]; a later call is a newer note. */
    fun add(userId: UUID, title: String?, parentId: UUID? = null): UUID {
        val node = NoteNode(UUID.randomUUID(), parentId, title, START.plusSeconds(nodes.size.toLong()))
        nodes[node.id] = node
        owners[node.id] = userId
        return node.id
    }

    fun parentOf(id: UUID): UUID? = nodes.getValue(id).parentNoteId

    private companion object {
        val START: Instant = Instant.parse("2026-10-19T09:00:00Z")
    }
}
