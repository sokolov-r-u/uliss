package io.uliss.note_service.service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.exception.NotePlaceInheritedException
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.repository.ConstellationRepository
import io.uliss.note_service.repository.NoteConstellationStore
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.util.NotePlacement
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.util.UUID

/**
 * The constellations a note belongs to. Every change takes the user's tree lock, so it cannot race a branch deletion
 * or another change of the same note; the rules live in [NotePlacement].
 */
@Service
class NotePlacementService(
    private val noteRepository: NoteRepository,
    private val constellationRepository: ConstellationRepository,
    private val store: NoteConstellationStore,
    private val clock: Clock = Clock.systemUTC(),
) {

    /** The note's memberships, main first. */
    fun getMemberships(userId: UUID, noteId: UUID): List<NoteMembership> {
        getOwnedNote(userId, noteId)
        return store.findByNote(userId, noteId)
    }

    /** Adds the note to a constellation; the first one becomes main. */
    @Transactional
    fun add(userId: UUID, noteId: UUID, constellationId: UUID): List<NoteMembership> =
        change(userId, noteId, constellationId) { NotePlacement.add(it, constellationId, clock.instant()) }

    /** Makes [constellationId] main; [replace] drops the previous main instead of keeping it as secondary. */
    @Transactional
    fun makeMain(userId: UUID, noteId: UUID, constellationId: UUID, replace: Boolean): List<NoteMembership> =
        change(userId, noteId, constellationId) {
            NotePlacement.makeMain(it, constellationId, replace, clock.instant())
        }

    /** Removes the note from a constellation; a removed main promotes the oldest remaining membership. */
    @Transactional
    fun remove(userId: UUID, noteId: UUID, constellationId: UUID): List<NoteMembership> =
        change(userId, noteId, joined = null) { NotePlacement.remove(it, constellationId) }

    /** Applies [rule] under the tree lock; [joined] is a constellation the note may join, so it must be the user's. */
    private fun change(
        userId: UUID,
        noteId: UUID,
        joined: UUID?,
        rule: (List<NoteMembership>) -> List<NoteMembership>,
    ): List<NoteMembership> {
        constellationRepository.lockUserTree(userId)
        val note = getOwnedNote(userId, noteId)
        if (note.parentNoteId != null) throw NotePlaceInheritedException(noteId)
        if (joined != null && !constellationRepository.existsByIdAndUserId(joined, userId)) {
            throw NotFoundException("constellation id=$joined not found")
        }
        val current = store.findByNote(userId, noteId)
        val next = rule(current)
        if (next != current) store.replace(userId, mapOf(noteId to next))
        return NotePlacement.ordered(next)
    }

    private fun getOwnedNote(userId: UUID, noteId: UUID): NoteEntity =
        noteRepository.findByIdAndUserId(noteId, userId) ?: throw NotFoundException("note id=$noteId not found")
}
