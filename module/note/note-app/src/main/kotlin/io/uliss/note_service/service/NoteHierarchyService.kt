package io.uliss.note_service.service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.dto.internal.NotePlace
import io.uliss.note_service.dto.internal.NoteSearchHit
import io.uliss.note_service.exception.ConstellationNotFoundException
import io.uliss.note_service.exception.NoteHasSubNotesException
import io.uliss.note_service.exception.NoteMoveCycleException
import io.uliss.note_service.exception.ParentNoteNotFoundException
import io.uliss.note_service.model.SubNoteFate
import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.model.projection.NoteNode
import io.uliss.note_service.repository.ConstellationRepository
import io.uliss.note_service.repository.NoteConstellationStore
import io.uliss.note_service.repository.NoteHierarchyStore
import io.uliss.note_service.util.ConstellationTree
import io.uliss.note_service.util.NoteHierarchy
import io.uliss.note_service.util.NoteRemoval
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.util.UUID

/**
 * Notes under notes: a sub-note has no constellations of its own and lives where its top note lives. Every change
 * takes the user's tree lock (shared with constellations and memberships) and checks a fresh snapshot of the user's
 * notes, so two opposite moves cannot close a cycle and a parent cannot vanish under a new sub-note.
 */
@Service
class NoteHierarchyService(
    private val hierarchyStore: NoteHierarchyStore,
    private val constellationRepository: ConstellationRepository,
    private val membershipStore: NoteConstellationStore,
    private val clock: Clock = Clock.systemUTC(),
) {

    /** The note's parent notes from the top one down and the constellations of its top note, main first. */
    fun getPlace(userId: UUID, noteId: UUID): NotePlace {
        val hierarchy = loadHierarchy(userId)
        getOwned(hierarchy, noteId)
        return placeOf(userId, hierarchy, noteId)
    }

    /** Titled notes matching [query] with their paths, leaving out [exclude] and its sub-notes. */
    fun search(userId: UUID, query: String, exclude: UUID?): List<NoteSearchHit> {
        val hierarchy = loadHierarchy(userId)
        val hits = hierarchy.search(query, exclude, SEARCH_LIMIT)
        val roots = hits.associate { it.id to hierarchy.rootOf(it.id).id }
        val mains = membershipStore.findByNotes(userId, roots.values.toSet())
            .mapValues { (_, memberships) -> memberships.firstOrNull { it.main }?.constellationId }
        return hits.map { NoteSearchHit(it, hierarchy.ancestorsOf(it.id), mains[roots.getValue(it.id)]) }
    }

    /** Hangs the note under [parentNoteId]; its own constellations go, its sub-notes follow it. */
    @Transactional
    fun moveUnder(userId: UUID, noteId: UUID, parentNoteId: UUID): NotePlace {
        val hierarchy = lockAndLoadHierarchy(userId)
        val note = getOwned(hierarchy, noteId)
        hierarchy.find(parentNoteId) ?: throw ParentNoteNotFoundException(parentNoteId)
        if (!hierarchy.canMoveUnder(noteId, parentNoteId)) throw NoteMoveCycleException(noteId, parentNoteId)
        if (note.parentNoteId == parentNoteId) return placeOf(userId, hierarchy, noteId)
        membershipStore.replace(userId, mapOf(noteId to emptyList()))
        hierarchyStore.setParent(userId, listOf(noteId), parentNoteId)
        return placeOf(userId, loadHierarchy(userId), noteId)
    }

    /**
     * Takes a sub-note out from under its parent: into [moveTo] as its only, main constellation, or without a place.
     * A top note stays as it is, so a repeated request changes nothing.
     */
    @Transactional
    fun moveOut(userId: UUID, noteId: UUID, moveTo: UUID?): NotePlace {
        val hierarchy = lockAndLoadHierarchy(userId)
        val note = getOwned(hierarchy, noteId)
        if (note.parentNoteId == null) return placeOf(userId, hierarchy, noteId)
        if (moveTo != null) {
            val tree = ConstellationTree(constellationRepository.findByUserIdOrderByCreatedAtAscIdAsc(userId))
            tree.find(moveTo) ?: throw ConstellationNotFoundException(moveTo)
        }
        hierarchyStore.setParent(userId, listOf(noteId), null)
        val memberships = listOfNotNull(moveTo?.let { NoteMembership(it, true, clock.instant()) })
        if (memberships.isNotEmpty()) membershipStore.replace(userId, mapOf(noteId to memberships))
        return NotePlace(emptyList(), memberships)
    }

    /**
     * Deletes the note in any status; FK cascades take its chat links, summary request, memberships and RAG chunks,
     * and chats stay. A note with sub-notes needs [subNotes]: KEEP gives them its place, DELETE takes the whole
     * subtree.
     */
    @Transactional
    fun delete(userId: UUID, noteId: UUID, subNotes: SubNoteFate?) {
        val hierarchy = lockAndLoadHierarchy(userId)
        getOwned(hierarchy, noteId)
        if (hierarchy.childrenOf(noteId).isEmpty()) {
            hierarchyStore.deleteNotes(userId, listOf(noteId))
            return
        }
        when (subNotes) {
            null -> throw NoteHasSubNotesException(noteId)
            SubNoteFate.DELETE -> hierarchyStore.deleteNotes(userId, hierarchy.subtreeIds(noteId))
            SubNoteFate.KEEP -> {
                val adoption = NoteRemoval.keepSubNotes(hierarchy, noteId, membershipStore.findByNote(userId, noteId))
                hierarchyStore.setParent(userId, adoption.childIds, adoption.parentNoteId)
                membershipStore.replace(userId, adoption.memberships)
                hierarchyStore.deleteNotes(userId, listOf(noteId))
            }
        }
    }

    private fun placeOf(userId: UUID, hierarchy: NoteHierarchy, noteId: UUID): NotePlace =
        NotePlace(hierarchy.ancestorsOf(noteId), membershipStore.findByNote(userId, hierarchy.rootOf(noteId).id))

    private fun lockAndLoadHierarchy(userId: UUID): NoteHierarchy {
        constellationRepository.lockUserTree(userId)
        return loadHierarchy(userId)
    }

    private fun loadHierarchy(userId: UUID) = NoteHierarchy(hierarchyStore.findNodes(userId))

    private fun getOwned(hierarchy: NoteHierarchy, noteId: UUID): NoteNode =
        hierarchy.find(noteId) ?: throw NotFoundException("note id=$noteId not found")

    private companion object {
        const val SEARCH_LIMIT = 20
    }
}
