package io.uliss.note_service.service

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.dto.internal.ProfileBatch
import io.uliss.note_service.dto.internal.ProfileRebuildState
import io.uliss.note_service.dto.internal.ProfileRulesState
import io.uliss.note_service.dto.internal.ProfileRulesWork
import io.uliss.note_service.exception.ProfileNothingToRebuildException
import io.uliss.note_service.exception.ProfileRebuildLimitException
import io.uliss.note_service.exception.ProfileRebuildRunningException
import io.uliss.note_service.dto.internal.UserBackground
import io.uliss.note_service.dto.internal.UserProfileInput
import io.uliss.note_service.dto.internal.UserProfileView
import io.uliss.note_service.model.ProfileRebuildStatus
import io.uliss.note_service.model.ProfileRebuildTrigger
import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.model.UserProfileRebuildEntity
import io.uliss.note_service.model.payload.UserProfileRefreshRequestedPayload
import io.uliss.note_service.model.projection.NotesMark
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.UserProfileInputRepository
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
    private val inputRepository: UserProfileInputRepository,
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

    /** What the model may know about the user before a reply or a summary; null while there is nothing. */
    @Transactional(readOnly = true)
    fun findBackground(userId: UUID): UserBackground? {
        val profile = profileRepository.findByUserId(userId)?.content
        val about = inputRepository.findByUserId(userId)?.about
        return if (profile == null && about == null) null else UserBackground(profile, about)
    }

    /**
     * The next notes the profile has not read, as many as one model call takes; null when it has read them all. While
     * a full rebuild runs, its draft reads the notes from the first one instead, and the live profile waits.
     */
    @Transactional(readOnly = true)
    fun findBatch(userId: UUID): ProfileBatch? {
        val rebuild = rebuildRepository.findByUserIdAndStatus(userId, ProfileRebuildStatus.RUNNING)
        if (rebuild != null) {
            return findBatchAfter(userId, rebuild.through, rebuild.batchShrink)?.copy(
                profile = rebuild.content, profileVersion = rebuild.version, rebuildId = rebuild.id, input = input(userId),
            )
        }
        val profile = profileRepository.findByUserId(userId)
        return findBatchAfter(userId, profile?.notesThrough, profile?.batchShrink ?: 0)
            ?.copy(profile = profile?.content, profileVersion = profile?.version, input = input(userId))
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
        val saved = profile
            ?: profileRepository.save(UserProfileEntity(userId, content, batch.through.updatedAt, batch.through.noteId))
        saved.content = content
        saved.notesThroughAt = batch.through.updatedAt
        saved.notesThroughId = batch.through.noteId
        saved.batchShrink = 0
        saved.rulesVersion = batch.input.rulesVersion
        saved.rulesFailedVersion = null
        // a rebuild started while this batch was read may have been left without an event, and rules saved meanwhile
        // found this event running and queued none
        if (batch.remain || rebuildRepository.findByUserIdAndStatus(userId, ProfileRebuildStatus.RUNNING) != null ||
            rulesVersion(userId) > saved.rulesVersion
        ) {
            requestRefresh(userId)
        }
    }

    /**
     * Ends the user's running rebuild once it has no more notes to read; nothing to do without one. A rebuild started
     * after the caller found no batch still has notes ahead: it is queued instead of finished empty.
     */
    @Transactional
    fun finishRebuild(userId: UUID) {
        val rebuild = rebuildRepository.findByUserIdAndStatus(userId, ProfileRebuildStatus.RUNNING) ?: return
        if (findBatchAfter(userId, rebuild.through, rebuild.batchShrink) == null) {
            finish(rebuild)
        } else {
            requestRefresh(userId)
        }
    }

    /**
     * The next batch, or bringing the profile in line with the rules when no batch is left, failed every attempt. A
     * batch of several notes, or a lone note on its first failure, is halved and tried again after
     * `shrink-retry-delay`, so a short provider outage does not cut it down to a healthy note; a single note that fails
     * again is skipped: the mark (of the rebuild draft while one runs) moves past it, and the next batch goes at once.
     */
    @Transactional
    fun handleFailedBatch(userId: UUID) {
        val batch = findBatch(userId) ?: return markRulesFailed(userId)
        val rebuild = batch.rebuildId?.let { rebuildRepository.findByIdOrNull(it) }
        val profile = if (rebuild == null) {
            profileRepository.findByUserId(userId) ?: profileRepository.save(UserProfileEntity(userId, null, null, null))
        } else {
            null
        }
        val shrink = rebuild?.batchShrink ?: profile?.batchShrink ?: 0
        // a lone note gets one delayed try too: its first failure may be an outage, not the note
        if (batch.notes.size > 1 || shrink == 0) {
            rebuild?.let { it.batchShrink++ }
            profile?.let { it.batchShrink++ }
            log.warn(
                "profile batch of user=$userId with ${batch.notes.size} notes failed for good, halving it",
                "handleFailedBatch",
            )
            requestRefresh(userId, properties.shrinkRetryDelay)
            return
        }
        val skipped = batch.through
        rebuild?.let {
            it.throughAt = skipped.updatedAt
            it.throughId = skipped.noteId
            it.batchShrink = 0
        }
        profile?.let {
            it.notesThroughAt = skipped.updatedAt
            it.notesThroughId = skipped.noteId
            it.batchShrink = 0
        }
        log.error("profile of user=$userId skips note id=${skipped.noteId}: the model fails on it", "handleFailedBatch")
        requestRefresh(userId)
    }

    /** The profile text to bring in line with newer rules of the user; null when it follows them or a rebuild runs. */
    @Transactional(readOnly = true)
    fun findRulesWork(userId: UUID): ProfileRulesWork? {
        if (rebuildRepository.findByUserIdAndStatus(userId, ProfileRebuildStatus.RUNNING) != null) return null
        val profile = profileRepository.findByUserId(userId) ?: return null
        val content = profile.content ?: return null
        val input = input(userId)
        if (profile.rulesVersion >= input.rulesVersion) return null
        return ProfileRulesWork(content, checkNotNull(profile.version), input)
    }

    /**
     * Saves [content] as the profile brought in line with the rules of [work]; its mark stays, as no note was read. A
     * profile saved meanwhile keeps its newer text: the run that saved it checks the rules itself.
     */
    @Transactional
    fun saveConformed(userId: UUID, work: ProfileRulesWork, content: String) {
        val profile = profileRepository.findByUserId(userId)
        if (profile?.version != work.profileVersion) {
            log.info("profile of user=$userId changed while it was brought in line with the rules, dropping it", "save")
            return
        }
        profile.content = content
        profile.rulesVersion = work.input.rulesVersion
        profile.rulesFailedVersion = null
        if (rulesVersion(userId) > profile.rulesVersion) requestRefresh(userId)
    }

    /** Whether the profile text is behind the user's rules, and whether applying the current ones failed for good. */
    @Transactional(readOnly = true)
    fun getRulesState(userId: UUID): ProfileRulesState {
        val profile = profileRepository.findByUserId(userId)
        val rulesVersion = rulesVersion(userId)
        if (profile?.content == null || profile.rulesVersion >= rulesVersion) return ProfileRulesState(false, false)
        val failed = profile.rulesFailedVersion == rulesVersion
        return ProfileRulesState(applying = !failed, failed = failed)
    }

    /** With no batch to blame, bringing the profile in line with the rules failed: retried at night, told meanwhile. */
    private fun markRulesFailed(userId: UUID) {
        findRulesWork(userId) ?: return
        // rules saved during the last attempt wait in their own refresh, not tried yet
        if (outboxService.isPending(refreshKey(userId))) return
        val profile = checkNotNull(profileRepository.findByUserId(userId))
        profile.rulesFailedVersion = rulesVersion(userId)
        log.warn("profile of user=$userId failed for good to follow its rules; retried at night", "handleFailedBatch")
    }

    /** Whether a rebuild of the user's profile runs, and how many the user may still start. */
    @Transactional(readOnly = true)
    fun getRebuildState(userId: UUID): ProfileRebuildState {
        val running = rebuildRepository.findByUserIdAndStatus(userId, ProfileRebuildStatus.RUNNING) != null
        return rebuildState(userId, running)
    }

    /**
     * Starts a full rebuild the user asked for. Refused while one runs, when there is nothing to read, and when the
     * user's rebuilds in the window are used up; rebuilds started for deletions do not count.
     */
    @Transactional
    fun requestRebuild(userId: UUID): ProfileRebuildState {
        rebuildRepository.lockUserRebuilds(userId)
        if (rebuildRepository.findByUserIdAndStatus(userId, ProfileRebuildStatus.RUNNING) != null) {
            throw ProfileRebuildRunningException(userId)
        }
        val profile = profileRepository.findByUserId(userId)
        if (profile?.content == null && !noteStore.existsReadyNote(userId)) throw ProfileNothingToRebuildException(userId)
        rebuildState(userId, running = false).availableAt?.let { throw ProfileRebuildLimitException(it) }
        // the row holds the deletion flag while the first profile is built
        if (profile == null) profileRepository.save(UserProfileEntity(userId, null, null, null))
        rebuildRepository.save(UserProfileRebuildEntity(userId, ProfileRebuildTrigger.USER))
        requestRefresh(userId)
        log.info("profile rebuild of user=$userId requested", "requestRebuild")
        return rebuildState(userId, running = true)
    }

    /** Flags the profile for a full rebuild when it may hold text of [noteIds]; call before deleting them. */
    @Transactional(propagation = Propagation.MANDATORY)
    fun markNotesDeleted(userId: UUID, noteIds: Collection<UUID>) {
        if (noteIds.isEmpty()) return
        noteStore.markDeleted(userId, noteIds, clock.instant())
    }

    /**
     * Queues a refresh for every user whose profile has settled notes to read, a rebuild running (its event may be
     * gone) or text behind the user's rules (applying them may have failed for good), and starts a rebuild for every
     * profile flagged by deletions and not rebuilt within the interval. A user whose refresh event already waits or runs
     * is left alone: moving it would cut a halved batch's delay, and a second event would read the same batch in
     * parallel; that event continues a rebuild started here.
     */
    @Transactional
    fun requestRefreshes() {
        val now = clock.instant()
        val toRebuild = profileRepository.findUserIdsDueForDeletionRebuild(now.minus(properties.deletionRebuildInterval))
            .toSet()
        val users = toRebuild + noteStore.findUsersToRefresh(now.minus(properties.settleDelay)) +
            rebuildRepository.findUserIdsByStatus(ProfileRebuildStatus.RUNNING) + profileRepository.findUserIdsBehindRules()
        // one order for every transaction: two runs locking and upserting the same users cannot deadlock
        users.sorted().forEach { userId ->
            val live = outboxService.hasLiveEvent(refreshKey(userId))
            when {
                userId in toRebuild -> startRebuild(userId, ProfileRebuildTrigger.DELETIONS, queue = !live)
                !live -> requestRefresh(userId)
            }
        }
        log.info(
            "queued profile refresh for ${users.size} users, ${toRebuild.size} of them full rebuilds",
            "requestRefreshes",
        )
    }

    /** Starts a full rebuild of the user's profile and, when [queue], queues its first batch. */
    private fun startRebuild(userId: UUID, trigger: ProfileRebuildTrigger, queue: Boolean) {
        rebuildRepository.lockUserRebuilds(userId)
        if (rebuildRepository.findByUserIdAndStatus(userId, ProfileRebuildStatus.RUNNING) == null) {
            rebuildRepository.save(UserProfileRebuildEntity(userId, trigger))
        }
        if (queue) requestRefresh(userId)
    }

    private fun rebuildState(userId: UUID, running: Boolean): ProfileRebuildState {
        val starts = rebuildRepository.findStartsAfter(
            userId, ProfileRebuildTrigger.USER, clock.instant().minus(properties.rebuildWindow),
        )
        val remaining = (properties.rebuildLimit - starts.size).coerceAtLeast(0)
        // a try comes back when enough starts leave the window to drop below the limit
        val availableAt = starts.getOrNull(starts.size - properties.rebuildLimit)?.plus(properties.rebuildWindow)
        return ProfileRebuildState(running, remaining, availableAt)
    }

    private fun rulesVersion(userId: UUID): Int = inputRepository.findByUserId(userId)?.rulesVersion ?: 0

    private fun input(userId: UUID): UserProfileInput =
        inputRepository.findByUserId(userId)?.let { UserProfileInput(it.about, it.rules, it.rulesVersion) }
            ?: UserProfileInput(null, emptyList())

    /** A batch [shrink] times halved after failures; it always reads at least one note. */
    private fun findBatchAfter(userId: UUID, mark: NotesMark?, shrink: Int): ProfileBatch? {
        val settledBefore = clock.instant().minus(properties.settleDelay)
        val maxNotes = (properties.batchMaxNotes shr shrink).coerceAtLeast(1)
        val notes = noteStore.findNotesAfter(userId, mark, settledBefore, maxNotes)
        val budget = (properties.batchMaxChars shr shrink).coerceAtLeast(1)
        // halving narrows the batch, never cuts a note further than the full budget would: the cut part is never read
        val batch = if (notes.isNotEmpty() && ProfileNoteBatch.size(notes.first()) > budget) {
            ProfileNoteBatch.take(notes, properties.batchMaxChars).take(1)
        } else {
            ProfileNoteBatch.take(notes, budget)
        }
        val last = batch.lastOrNull() ?: return null
        return ProfileBatch(
            profile = null,
            profileVersion = null,
            notes = batch,
            through = NotesMark(last.updatedAt, last.id),
            remain = batch.size < notes.size || notes.size == maxNotes,
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
        rebuild.batchShrink = 0
        rebuild.rulesVersion = batch.input.rulesVersion
        if (batch.remain) requestRefresh(userId) else finish(rebuild)
    }

    /**
     * Replaces the live profile with the rebuild's draft, mark and rules version (an empty draft leaves no text). A
     * deletion made before the rebuild started is in it; one made while it ran may not be, so its flag stays.
     */
    private fun finish(rebuild: UserProfileRebuildEntity) {
        val profile = profileRepository.findByUserId(rebuild.userId)
            ?: profileRepository.save(UserProfileEntity(rebuild.userId, null, null, null))
        profile.content = rebuild.content
        profile.notesThroughAt = rebuild.throughAt
        profile.notesThroughId = rebuild.throughId
        profile.batchShrink = 0
        profile.rulesVersion = rebuild.rulesVersion
        profile.rulesFailedVersion = null
        if (profile.lastDeletionAt?.isAfter(checkNotNull(rebuild.createdAt)) == false) profile.lastDeletionAt = null
        rebuild.status = ProfileRebuildStatus.DONE
        rebuild.finishedAt = clock.instant()
        rebuild.content = null
        log.info("profile rebuild of user=${rebuild.userId} (${rebuild.trigger}) finished", "finish")
        // rules saved while the last batch was read are not in the draft yet
        if (profile.content != null && rulesVersion(rebuild.userId) > profile.rulesVersion) requestRefresh(rebuild.userId)
    }

    /** Queues a refresh of the user's profile, due after [delay]; one already waiting is moved, not duplicated. */
    fun requestRefresh(userId: UUID, delay: Duration = Duration.ZERO) {
        outboxService.publishDebounced(
            OutboxEventType.USER_PROFILE_REFRESH_REQUESTED,
            objectMapper.writeValueAsString(UserProfileRefreshRequestedPayload(userId)),
            refreshKey(userId),
            delay,
        )
    }

    private fun refreshKey(userId: UUID) = "${OutboxEventType.USER_PROFILE_REFRESH_REQUESTED}:$userId"
}
