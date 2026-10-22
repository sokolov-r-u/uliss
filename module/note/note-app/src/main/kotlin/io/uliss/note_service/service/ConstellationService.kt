package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.dto.internal.ConstellationView
import io.uliss.note_service.exception.ConstellationMoveCycleException
import io.uliss.note_service.exception.ConstellationNameTakenException
import io.uliss.note_service.model.ConstellationEntity
import io.uliss.note_service.model.ConstellationLightness
import io.uliss.note_service.repository.ConstellationRepository
import io.uliss.note_service.repository.NoteConstellationStore
import io.uliss.note_service.util.ConstellationColors
import io.uliss.note_service.util.ConstellationNameNormalizer
import io.uliss.note_service.util.ConstellationTree
import io.uliss.note_service.util.NotePlacement
import org.hibernate.exception.ConstraintViolationException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.util.UUID

/**
 * The user's constellation tree. Every change takes the user's tree lock first and then checks the change against a
 * fresh snapshot, so concurrent changes cannot close a cycle or slip past the name check.
 */
@Service
class ConstellationService(
    private val repository: ConstellationRepository,
    private val noteConstellationStore: NoteConstellationStore,
    private val noteIndexRequestService: NoteIndexRequestService,
    private val clock: Clock = Clock.systemUTC(),
) {

    fun getTree(userId: UUID): List<ConstellationView> = loadTree(userId).views()

    /** The number of notes that would lose their only places with the branch, so deleting it has to move them. */
    fun getDeletionImpact(userId: UUID, id: UUID): Int {
        val tree = loadTree(userId, withCounts = false)
        getOwned(tree, id)
        val branchIds = tree.branchIds(id)
        return noteConstellationStore.findByNotesInConstellations(userId, branchIds).values
            .count { NotePlacement.needsMove(it, branchIds) }
    }

    @Transactional
    fun create(userId: UUID, rawName: String, parentId: UUID?): ConstellationView {
        val tree = lockAndLoadTree(userId)
        val name = normalizeName(rawName)
        val entity = if (parentId == null) {
            ConstellationEntity(userId, null, name, ConstellationColors.pickRootHue(tree.roots().mapNotNull { it.hue }), null)
        } else {
            val parent = getOwned(tree, parentId)
            ConstellationEntity(userId, parent.id, name, null, ConstellationColors.lightnessForDepth(tree.depthOf(parent.id) + 1))
        }
        if (tree.isNameTaken(parentId, name, exceptId = null)) throw ConstellationNameTakenException(name)
        return saveAndView(userId, entity)
    }

    /**
     * Renames and/or recolours: [hue] applies only to a root, [lightness] only to a sub-constellation. A new name
     * reindexes the notes of the branch, whose place carries it; a colour does not.
     */
    @Transactional
    fun update(
        userId: UUID,
        id: UUID,
        rawName: String?,
        hue: Int?,
        lightness: ConstellationLightness?,
    ): ConstellationView {
        if (rawName == null && hue == null && lightness == null) throw BadRequestException("nothing to update")
        val tree = lockAndLoadTree(userId)
        val entity = getOwned(tree, id)
        if (hue != null) {
            if (entity.parentId != null) throw BadRequestException("only a root constellation has a hue")
            if (hue !in HUE_RANGE) throw BadRequestException("hue must be 0 to 359")
        }
        if (lightness != null && entity.parentId == null) {
            throw BadRequestException("a root constellation has no lightness")
        }
        if (rawName != null) {
            val name = normalizeName(rawName)
            if (tree.isNameTaken(entity.parentId, name, exceptId = entity.id)) throw ConstellationNameTakenException(name)
            if (name != entity.name) requestReindexOfBranch(userId, tree.branchIds(id))
            entity.name = name
        }
        hue?.let { entity.hue = it }
        lightness?.let { entity.lightness = it }
        return saveAndView(userId, entity)
    }

    /**
     * Moves the branch under [parentId], or makes it a root when null. A root moved under another node drops its hue
     * and takes the default lightness of its new depth; a sub-constellation made a root keeps its inherited hue.
     */
    @Transactional
    fun move(userId: UUID, id: UUID, parentId: UUID?): ConstellationView {
        val tree = lockAndLoadTree(userId)
        val entity = getOwned(tree, id)
        if (parentId == entity.parentId) return loadTree(userId).view(id)
        if (parentId != null) {
            getOwned(tree, parentId)
            if (tree.isInBranch(parentId, id)) throw ConstellationMoveCycleException(id, parentId)
        }
        if (tree.isNameTaken(parentId, entity.name, exceptId = entity.id)) {
            throw ConstellationNameTakenException(entity.name)
        }
        when {
            parentId == null -> {
                entity.hue = tree.rootOf(id).hue
                entity.lightness = null
            }

            entity.parentId == null -> {
                entity.hue = null
                entity.lightness = ConstellationColors.lightnessForDepth(tree.depthOf(parentId) + 1)
            }
        }
        entity.parentId = parentId
        save(entity)
        // A new root has no ancestors, so no place of its notes can come to share a line.
        if (parentId != null) keepOnePlacePerLine(userId, id)
        requestReindexOfBranch(userId, tree.branchIds(id))
        return loadTree(userId).view(id)
    }

    /** A moved branch may put two places of a note on one line: the deeper place stays (and inherits a lost main). */
    private fun keepOnePlacePerLine(userId: UUID, movedId: UUID) {
        val tree = loadTree(userId, withCounts = false)
        val touched = noteConstellationStore.findByNotesInConstellations(userId, tree.branchIds(movedId))
        val changed = touched
            .mapValues { (_, memberships) -> NotePlacement.keepDeepest(memberships, tree::isAncestor) }
            .filter { (noteId, memberships) -> memberships != touched[noteId] }
        noteConstellationStore.replace(userId, changed)
    }

    /**
     * Deletes the branch with all its sub-constellations; notes are never deleted. A note with places outside the
     * branch only loses those inside it; a note placed only inside moves to [moveTo] as its main place, or is left
     * without a constellation when [moveTo] is null.
     */
    @Transactional
    fun delete(userId: UUID, id: UUID, moveTo: UUID?) {
        val tree = lockAndLoadTree(userId)
        getOwned(tree, id)
        val branchIds = tree.branchIds(id)
        if (moveTo != null) {
            getOwned(tree, moveTo)
            if (moveTo in branchIds) throw BadRequestException("notes cannot move into the deleted branch")
        }
        val now = clock.instant()
        val touched = noteConstellationStore.findByNotesInConstellations(userId, branchIds)
        noteConstellationStore.replace(
            userId,
            touched.mapValues { (_, memberships) -> NotePlacement.withoutBranch(memberships, branchIds, moveTo, now) },
        )
        repository.deleteBranch(userId, id)
        noteIndexRequestService.requestLaterWithSubNotes(userId, touched.keys)
    }

    /** The notes placed in the branch and their sub-notes carry its path in their index. */
    private fun requestReindexOfBranch(userId: UUID, branchIds: Set<UUID>) {
        val placed = noteConstellationStore.findByNotesInConstellations(userId, branchIds).keys
        noteIndexRequestService.requestLaterWithSubNotes(userId, placed)
    }

    private fun lockAndLoadTree(userId: UUID): ConstellationTree {
        repository.lockUserTree(userId)
        return loadTree(userId, withCounts = false)
    }

    /** Note counts only matter for views; checks under the lock skip the counting query. */
    private fun loadTree(userId: UUID, withCounts: Boolean = true) = ConstellationTree(
        repository.findByUserIdOrderByCreatedAtAscIdAsc(userId),
        if (withCounts) noteConstellationStore.countNotes(userId) else emptyList(),
    )

    private fun getOwned(tree: ConstellationTree, id: UUID): ConstellationEntity = tree.find(id) ?: throw notFound(id)

    private fun normalizeName(rawName: String): String =
        ConstellationNameNormalizer.normalize(rawName) ?: throw BadRequestException(ConstellationNameNormalizer.RULE)

    private fun saveAndView(userId: UUID, entity: ConstellationEntity): ConstellationView {
        save(entity)
        return loadTree(userId).view(entity.id)
    }

    /** Saves under the tree lock; the unique index stays the backstop when collations disagree on case. */
    private fun save(entity: ConstellationEntity) {
        try {
            repository.saveAndFlush(entity)
        } catch (e: DataIntegrityViolationException) {
            val constraint = (e.cause as? ConstraintViolationException)?.constraintName
            if (constraint == NAME_INDEX) throw ConstellationNameTakenException(entity.name, e)
            throw e
        }
    }

    private fun notFound(id: UUID) = NotFoundException("constellation id=$id not found")

    private companion object {
        val HUE_RANGE = 0..359
        const val NAME_INDEX = "uq_constellations_user_parent_name"
    }
}
