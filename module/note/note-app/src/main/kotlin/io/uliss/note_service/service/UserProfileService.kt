package io.uliss.note_service.service

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.dto.internal.ProfileBatch
import io.uliss.note_service.dto.internal.UserProfileView
import io.uliss.note_service.model.ProfileRebuildStatus
import io.uliss.note_service.model.ProfileRebuildTrigger
import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.model.UserProfileRebuildEntity
import io.uliss.note_service.model.payload.UserProfileRefreshRequestedPayload
import io.uliss.note_service.model.projection.NotesMark
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.UserProfileNoteStore
import io.uliss.note_service.repository.UserProfileRebuildRepository
import io.uliss.note_service.repository.UserProfileRepository
import org.springframework.data.repository.findByIdOrNull
import io.uliss.note_service.util.ProfileNoteBatch
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Duration
import java.util.UUID

/** Keeps the user profile: which notes it reads next, and saving what the model wrote from them. */
@Service
class UserProfileService(
    private val profileRepository: UserProfileRepository,
    private val rebuildRepository: UserProfileRebuildRepository,
    private val noteStore: UserProfileNoteStore,
    private val outboxService: OutboxService,
    private val objectMapper: ObjectMapper,
    private val properties: UserProfileProperties,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val log = AppLogger.of(UserProfileService::class)

    /** The user's profile, or null until the first refresh writes it. */
    @Transactional(readOnly = true)
    fun findProfile(userId: UUID): UserProfileView? =
        profileRepository.findByUserId(userId)?.let { profile ->
            profile.content?.let { UserProfileView(it, checkNotNull(profile.updatedAt)) }
        }

    /**
     * The next notes the profile has not read, as many as one model call takes; null when it has read them all. While
     * a full rebuild runs, its draft reads the notes from the first one instead, and the live profile waits.
     */
    @Transactional(readOnly = true)
    fun findBatch(userId: UUID): ProfileBatch? {
        val rebuild = rebuildRepository.findByUserIdAndStatus(userId, ProfileRebuildStatus.RUNNING)
        if (rebuild != null) {
            return findBatchAfter(userId, rebuild.through)
                ?.copy(profile = rebuild.content, profileVersion = rebuild.version, rebuildId = rebuild.id)
        }
        val profile = profileRepository.findByUserId(userId)
        return findBatchAfter(userId, profile?.notesThrough)
            ?.copy(profile = profile?.content, profileVersion = profile?.version)
    }

    /**
     * Saves [content] as the profile (or the rebuild draft) that has read [batch], and queues the next batch while notes
     * remain; the last batch of a rebuild replaces the live profile. A batch read from another version is dropped:
     * another run saved meanwhile, and its notes would be mixed in or lost. A concurrent first save fails on the unique
     * user and is retried from the saved profile.
     */
    @Transactional
    fun save(userId: UUID, batch: ProfileBatch, content: String) {
        if (batch.rebuildId != null) return saveDraft(userId, batch, content)
        val profile = profileRepository.findByUserId(userId)
        if (profile?.version != batch.profileVersion) {
            log.info("profile of user=$userId changed since its batch was read, dropping the batch", "save")
            return
        }
        if (profile == null) {
            profileRepository.save(UserProfileEntity(userId, content, batch.through.updatedAt, batch.through.noteId))
        } else {
            profile.content = content
            profile.notesThroughAt = batch.through.updatedAt
            profile.notesThroughId = batch.through.noteId
        }
        if (batch.remain) requestRefresh(userId)
    }

    /** Ends the user's running rebuild when it found no more notes to read; nothing to do without one. */
    @Transactional
    fun finishRebuild(userId: UUID) {
        rebuildRepository.findByUserIdAndStatus(userId, ProfileRebuildStatus.RUNNING)?.let(::finish)
    }

    /** Flags the profile for a full rebuild when it may hold text of [noteIds]; call before deleting them. */
    @Transactional(propagation = Propagation.MANDATORY)
    fun markNotesDeleted(userId: UUID, noteIds: Collection<UUID>) {
        if (noteIds.isEmpty()) return
        noteStore.markDeleted(userId, noteIds, clock.instant())
    }

    /**
     * Queues a refresh for every user whose profile has settled notes to read or a rebuild running (its event may be
     * gone), and starts a rebuild for every profile flagged by deletions and not rebuilt within the interval. An event
     * already waiting is reused.
     */
    @Transactional
    fun requestRefreshes() {
        val now = clock.instant()
        val toRebuild = profileRepository.findUserIdsDueForDeletionRebuild(now.minus(properties.deletionRebuildInterval))
            .toSet()
        val users = toRebuild + noteStore.findUsersToRefresh(now.minus(properties.settleDelay)) +
            rebuildRepository.findUserIdsByStatus(ProfileRebuildStatus.RUNNING)
        // one order for every transaction: two runs locking and upserting the same users cannot deadlock
        users.sorted().forEach { userId ->
            if (userId in toRebuild) startRebuild(userId, ProfileRebuildTrigger.DELETIONS) else requestRefresh(userId)
        }
        log.info(
            "queued profile refresh for ${users.size} users, ${toRebuild.size} of them full rebuilds",
            "requestRefreshes",
        )
    }

    /** Starts a full rebuild of the user's profile and queues its first batch; a running one is only queued again. */
    private fun startRebuild(userId: UUID, trigger: ProfileRebuildTrigger) {
        rebuildRepository.lockUserRebuilds(userId)
        if (rebuildRepository.findByUserIdAndStatus(userId, ProfileRebuildStatus.RUNNING) == null) {
            rebuildRepository.save(UserProfileRebuildEntity(userId, trigger))
        }
        requestRefresh(userId)
    }

    private fun findBatchAfter(userId: UUID, mark: NotesMark?): ProfileBatch? {
        val settledBefore = clock.instant().minus(properties.settleDelay)
        val notes = noteStore.findNotesAfter(userId, mark, settledBefore, properties.batchMaxNotes)
        val batch = ProfileNoteBatch.take(notes, properties.batchMaxChars)
        val last = batch.lastOrNull() ?: return null
        return ProfileBatch(
            profile = null,
            profileVersion = null,
            notes = batch,
            through = NotesMark(last.updatedAt, last.id),
            remain = batch.size < notes.size || notes.size == properties.batchMaxNotes,
        )
    }

    private fun saveDraft(userId: UUID, batch: ProfileBatch, content: String) {
        val rebuild = rebuildRepository.findByIdOrNull(checkNotNull(batch.rebuildId))
        if (rebuild?.status != ProfileRebuildStatus.RUNNING || rebuild.version != batch.profileVersion) {
            log.info("profile rebuild of user=$userId changed since its batch was read, dropping the batch", "save")
            return
        }
        rebuild.content = content
        rebuild.throughAt = batch.through.updatedAt
        rebuild.throughId = batch.through.noteId
        if (batch.remain) requestRefresh(userId) else finish(rebuild)
    }

    /**
     * Replaces the live profile with the rebuild's draft and mark (an empty draft leaves no text). A deletion made
     * before the rebuild started is in it; one made while it ran may not be, so its flag stays.
     */
    private fun finish(rebuild: UserProfileRebuildEntity) {
        val profile = profileRepository.findByUserId(rebuild.userId)
            ?: profileRepository.save(UserProfileEntity(rebuild.userId, null, null, null))
        profile.content = rebuild.content
        profile.notesThroughAt = rebuild.throughAt
        profile.notesThroughId = rebuild.throughId
        if (profile.lastDeletionAt?.isAfter(checkNotNull(rebuild.createdAt)) == false) profile.lastDeletionAt = null
        rebuild.status = ProfileRebuildStatus.DONE
        rebuild.finishedAt = clock.instant()
        rebuild.content = null
        log.info("profile rebuild of user=${rebuild.userId} (${rebuild.trigger}) finished", "finish")
    }

    /** Queues a refresh of the user's profile; one already waiting is reused. */
    fun requestRefresh(userId: UUID) {
        outboxService.publishDebounced(
            OutboxEventType.USER_PROFILE_REFRESH_REQUESTED,
            objectMapper.writeValueAsString(UserProfileRefreshRequestedPayload(userId)),
            "${OutboxEventType.USER_PROFILE_REFRESH_REQUESTED}:$userId",
            Duration.ZERO,
        )
    }
}
