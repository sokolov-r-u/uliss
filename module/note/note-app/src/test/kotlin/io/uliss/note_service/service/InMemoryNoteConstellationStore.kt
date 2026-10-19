package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.repository.NoteConstellationStore
import io.uliss.note_service.util.NotePlacement
import org.mockito.Mockito
import java.util.UUID

/** A [NoteConstellationStore] mock backed by maps, so service tests see their own writes. */
class InMemoryNoteConstellationStore {
    val rows = linkedMapOf<UUID, List<NoteMembership>>()
    private val owners = mutableMapOf<UUID, UUID>()
    val store: NoteConstellationStore = Mockito.mock(NoteConstellationStore::class.java)

    init {
        Mockito.`when`(store.findByNote(anyValue(), anyValue())).thenAnswer { invocation ->
            val noteId = invocation.getArgument<UUID>(1)
            if (owners[noteId] == invocation.getArgument<UUID>(0)) NotePlacement.ordered(rows[noteId].orEmpty())
            else emptyList()
        }
        Mockito.`when`(store.findByNotesInConstellations(anyValue(), anyValue())).thenAnswer { invocation ->
            val userId = invocation.getArgument<UUID>(0)
            val ids = invocation.getArgument<Collection<UUID>>(1).toSet()
            rows.filter { (noteId, memberships) ->
                owners[noteId] == userId && memberships.any { it.constellationId in ids }
            }.mapValues { NotePlacement.ordered(it.value) }
        }
        Mockito.`when`(store.replace(anyValue(), anyValue())).thenAnswer { invocation ->
            val userId = invocation.getArgument<UUID>(0)
            invocation.getArgument<Map<UUID, List<NoteMembership>>>(1).forEach { (noteId, memberships) ->
                put(userId, noteId, memberships)
            }
        }
        Mockito.`when`(store.findByNotes(anyValue(), anyValue())).thenAnswer { invocation ->
            val userId = invocation.getArgument<UUID>(0)
            val ids = invocation.getArgument<Collection<UUID>>(1).toSet()
            rows.filter { (noteId, _) -> noteId in ids && owners[noteId] == userId }
                .mapValues { NotePlacement.ordered(it.value) }
        }
        Mockito.`when`(store.countNotes(anyValue())).thenReturn(emptyList())
    }

    fun put(userId: UUID, noteId: UUID, memberships: List<NoteMembership>) {
        owners[noteId] = userId
        if (memberships.isEmpty()) rows.remove(noteId) else rows[noteId] = memberships
    }
}
