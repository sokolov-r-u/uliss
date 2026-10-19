package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.ConstellationView
import io.uliss.note_service.model.ConstellationEntity
import io.uliss.note_service.model.ConstellationLightness
import java.util.Locale
import java.util.UUID

/** Read-only view of one user's constellations as a tree; built from a consistent snapshot. */
class ConstellationTree(private val nodes: Collection<ConstellationEntity>) {
    private val byId = nodes.associateBy { it.id }

    fun find(id: UUID): ConstellationEntity? = byId[id]

    fun roots(): List<ConstellationEntity> = nodes.filter { it.parentId == null }

    /** Depth of the node: 0 for a root. */
    fun depthOf(id: UUID): Int = pathOf(id).size - 1

    fun rootOf(id: UUID): ConstellationEntity = pathOf(id).first()

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
            noteCount = 0,
        )
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
