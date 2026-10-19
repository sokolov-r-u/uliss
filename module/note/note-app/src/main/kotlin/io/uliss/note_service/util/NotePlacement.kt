package io.uliss.note_service.util

import io.uliss.note_service.model.projection.NoteMembership
import java.time.Instant
import java.util.UUID

/**
 * The membership rules of one note: the first constellation becomes main, a non-empty set has exactly one main, and
 * a lost main is replaced by the oldest remaining membership (earliest `addedAt`, then the smallest id). A note has at
 * most one place on each root-to-leaf line: `isAncestor(a, b)` tells whether `a` lies strictly above `b`.
 */
object NotePlacement {

    private val OLDEST_FIRST = compareBy<NoteMembership> { it.addedAt }.thenBy { it.constellationId }

    /** Main first, then by added time. */
    fun ordered(memberships: List<NoteMembership>): List<NoteMembership> =
        memberships.sortedWith(compareByDescending<NoteMembership> { it.main }.then(OLDEST_FIRST))

    /**
     * Adds [constellationId] as secondary, or as main when the note has no place yet; a member stays as it is. Places
     * on the same line give way to it, and it takes over their main flag.
     */
    fun add(
        memberships: List<NoteMembership>,
        constellationId: UUID,
        now: Instant,
        isAncestor: (UUID, UUID) -> Boolean,
    ): List<NoteMembership> {
        if (memberships.any { it.constellationId == constellationId }) return memberships
        val (onLine, rest) = memberships.partition { onOneLine(it.constellationId, constellationId, isAncestor) }
        val main = rest.isEmpty() || onLine.any { it.main }
        return ordered(rest + NoteMembership(constellationId, main, now))
    }

    /** Removes [constellationId]; a removed main promotes the oldest remaining membership. */
    fun remove(memberships: List<NoteMembership>, constellationId: UUID): List<NoteMembership> {
        if (memberships.none { it.constellationId == constellationId }) return memberships
        return withMain(memberships.filter { it.constellationId != constellationId })
    }

    /**
     * Makes [constellationId] main, adding it when the note is not there yet. [replace] drops the previous main
     * (the note changes its place); otherwise the previous main stays as secondary. Places on the same line give way.
     */
    fun makeMain(
        memberships: List<NoteMembership>,
        constellationId: UUID,
        replace: Boolean,
        now: Instant,
        isAncestor: (UUID, UUID) -> Boolean,
    ): List<NoteMembership> {
        if (memberships.firstOrNull { it.main }?.constellationId == constellationId) return memberships
        val cleared = memberships.filterNot { onOneLine(it.constellationId, constellationId, isAncestor) }
        val current = cleared.firstOrNull { it.main }
        val kept = if (replace && current != null) cleared - current else cleared
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

    /**
     * Restores one place per line after the tree changed (a branch moved): an ancestor of another place is dropped,
     * and a dropped main passes to the oldest of its remaining descendants.
     */
    fun keepDeepest(memberships: List<NoteMembership>, isAncestor: (UUID, UUID) -> Boolean): List<NoteMembership> {
        val (dropped, rest) = memberships.partition { above ->
            memberships.any { isAncestor(above.constellationId, it.constellationId) }
        }
        if (dropped.isEmpty()) return memberships
        val lostMain = dropped.firstOrNull { it.main } ?: return ordered(rest)
        val heir = rest.filter { isAncestor(lostMain.constellationId, it.constellationId) }.minWith(OLDEST_FIRST)
        return ordered(rest.map { if (it == heir) it.copy(main = true) else it })
    }

    /** True when the note is placed and every one of its memberships lies inside [branchIds]. */
    fun needsMove(memberships: List<NoteMembership>, branchIds: Set<UUID>): Boolean =
        memberships.isNotEmpty() && memberships.all { it.constellationId in branchIds }

    private fun onOneLine(a: UUID, b: UUID, isAncestor: (UUID, UUID) -> Boolean): Boolean =
        a != b && (isAncestor(a, b) || isAncestor(b, a))

    /** Ordered, with the oldest membership promoted when none is main. */
    private fun withMain(memberships: List<NoteMembership>): List<NoteMembership> {
        if (memberships.isEmpty() || memberships.any { it.main }) return ordered(memberships)
        val oldest = memberships.minWith(OLDEST_FIRST)
        return ordered(memberships.map { if (it == oldest) it.copy(main = true) else it })
    }
}
