package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.ConstellationView
import io.uliss.note_service.model.ConstellationEntity
import io.uliss.note_service.model.ConstellationLightness
import io.uliss.note_service.model.projection.ConstellationNoteCount
import java.util.Locale
import java.util.UUID

/** Read-only view of one user's constellations as a tree; built from a consistent snapshot. */
class ConstellationTree(
    private val nodes: Collection<ConstellationEntity>,
    /** Note counts by constellation id; a node without notes is absent. */
    noteCounts: Collection<ConstellationNoteCount> = emptyList(),
) {
    private val byId = nodes.associateBy { it.id }
    private val countsById = noteCounts.associateBy { it.constellationId }

    fun find(id: UUID): ConstellationEntity? = byId[id]

    fun roots(): List<ConstellationEntity> = nodes.filter { it.parentId == null }

    /** Depth of the node: 0 for a root. */
    fun depthOf(id: UUID): Int = pathOf(id).size - 1

    fun rootOf(id: UUID): ConstellationEntity = byId.getValue(rootIdOf(id))

    /** [id] with all its descendants. */
    fun branchIds(id: UUID): Set<UUID> = nodes.filter { isInBranch(it.id, id) }.map { it.id }.toSet()

    /** True when [ancestor] lies strictly above [descendant]. */
    fun isAncestor(ancestor: UUID, descendant: UUID): Boolean =
        ancestor != descendant && isInBranch(descendant, ancestor)

    /** True when [id] is [branchId] or one of its descendants. */
    fun isInBranch(id: UUID, branchId: UUID): Boolean = pathOf(id).any { it.id == branchId }

    /** True when a sibling under [parentId], other than [exceptId], already has [name] regardless of case. */
    fun isNameTaken(parentId: UUID?, name: String, exceptId: UUID?): Boolean {
        val key = name.lowercase(Locale.ROOT)
        return nodes.any { it.parentId == parentId && it.id != exceptId && it.name.lowercase(Locale.ROOT) == key }
    }

    fun views(): List<ConstellationView> = nodes.map { view(it.id) }

    fun view(id: UUID): ConstellationView {
        val node = byId.getValue(id)
        val root = rootOf(id)
        return ConstellationView(
            id = node.id,
            parentId = node.parentId,
            name = node.name,
            hue = checkNotNull(root.hue) { "root id=${root.id} has no hue" },
            lightness = node.lightness ?: ConstellationLightness.BASE,
            noteCount = countsById[id]?.noteCount ?: 0,
            ownNoteCount = countsById[id]?.ownNoteCount ?: 0,
        )
    }

    private val rootIds = HashMap<UUID, UUID>()

    /** Remembered per node, so [views] of a deep tree walk each path once instead of once per node. */
    private fun rootIdOf(id: UUID): UUID {
        val walked = mutableListOf<UUID>()
        var current = id
        while (true) {
            rootIds[current]?.let { root ->
                walked.forEach { rootIds[it] = root }
                return root
            }
            walked += current
            check(walked.size <= nodes.size) { "constellation id=$id is on a cycle" }
            current = byId.getValue(current).parentId ?: break
        }
        walked.forEach { rootIds[it] = current }
        return current
    }

    /** Root first, the node last. */
    private fun pathOf(id: UUID): List<ConstellationEntity> {
        val path = ArrayDeque<ConstellationEntity>()
        var current: ConstellationEntity? = byId.getValue(id)
        while (current != null) {
            check(path.size <= nodes.size) { "constellation id=$id is on a cycle" }
            path.addFirst(current)
            current = current.parentId?.let(byId::getValue)
        }
        return path
    }
}
