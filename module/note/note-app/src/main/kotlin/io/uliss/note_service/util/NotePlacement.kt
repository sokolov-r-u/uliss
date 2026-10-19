package io.uliss.note_service.util

import io.uliss.note_service.model.projection.NoteMembership
import java.time.Instant
import java.util.UUID

/**
 * The membership rules of one note: the first constellation becomes main, a non-empty set has exactly one main, and
 * a lost main is replaced by the oldest remaining membership (earliest `addedAt`, then the smallest id).
 */
object NotePlacement {

    private val OLDEST_FIRST = compareBy<NoteMembership> { it.addedAt }.thenBy { it.constellationId }

    /** Main first, then by added time. */
    fun ordered(memberships: List<NoteMembership>): List<NoteMembership> =
        memberships.sortedWith(compareByDescending<NoteMembership> { it.main }.then(OLDEST_FIRST))

    /** Adds [constellationId] as secondary, or as main when the note has no place yet; a member stays as it is. */
    fun add(memberships: List<NoteMembership>, constellationId: UUID, now: Instant): List<NoteMembership> {
        if (memberships.any { it.constellationId == constellationId }) return memberships
        return memberships + NoteMembership(constellationId, memberships.isEmpty(), now)
    }

    /** Removes [constellationId]; a removed main promotes the oldest remaining membership. */
    fun remove(memberships: List<NoteMembership>, constellationId: UUID): List<NoteMembership> {
        if (memberships.none { it.constellationId == constellationId }) return memberships
        return withMain(memberships.filter { it.constellationId != constellationId })
    }

    /**
     * Makes [constellationId] main, adding it when the note is not there yet. [replace] drops the previous main
     * (the note changes its place); otherwise the previous main stays as secondary.
     */
    fun makeMain(
        memberships: List<NoteMembership>,
        constellationId: UUID,
        replace: Boolean,
        now: Instant,
    ): List<NoteMembership> {
        val current = memberships.firstOrNull { it.main }
        if (current?.constellationId == constellationId) return memberships
        val kept = if (replace && current != null) memberships - current else memberships
        val target = kept.firstOrNull { it.constellationId == constellationId }
            ?: NoteMembership(constellationId, true, now)
        return listOf(target.copy(main = true)) +
            kept.filter { it.constellationId != constellationId }.map { it.copy(main = false) }
    }

    /**
     * The memberships left when the constellations [branchIds] are deleted. A note with places outside the branch keeps
     * them (promoting a main if it lost one); a note only inside moves to [moveTo] as main, or loses its place.
     */
    fun withoutBranch(
        memberships: List<NoteMembership>,
        branchIds: Set<UUID>,
        moveTo: UUID?,
        now: Instant,
    ): List<NoteMembership> {
        require(moveTo == null || moveTo !in branchIds) { "the target must lie outside the deleted branch" }
        val outside = memberships.filter { it.constellationId !in branchIds }
        if (outside.isNotEmpty()) return withMain(outside)
        return if (moveTo == null) emptyList() else listOf(NoteMembership(moveTo, true, now))
    }

    /** True when the note is placed and every one of its memberships lies inside [branchIds]. */
    fun needsMove(memberships: List<NoteMembership>, branchIds: Set<UUID>): Boolean =
        memberships.isNotEmpty() && memberships.all { it.constellationId in branchIds }

    /** Ordered, with the oldest membership promoted when none is main. */
    private fun withMain(memberships: List<NoteMembership>): List<NoteMembership> {
        if (memberships.isEmpty() || memberships.any { it.main }) return ordered(memberships)
        val oldest = memberships.minWith(OLDEST_FIRST)
        return ordered(memberships.map { if (it == oldest) it.copy(main = true) else it })
    }
}
