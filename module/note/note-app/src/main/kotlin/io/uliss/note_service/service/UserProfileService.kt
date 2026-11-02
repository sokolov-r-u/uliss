package io.uliss.note_service.service

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.dto.internal.ProfileBatch
import io.uliss.note_service.dto.internal.UserProfileView
import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.model.payload.UserProfileRefreshRequestedPayload
import io.uliss.note_service.model.projection.NotesMark
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.UserProfileNoteStore
import io.uliss.note_service.repository.UserProfileRepository
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

    /** The next notes the profile has not read, as many as one model call takes; null when it has read them all. */
    @Transactional(readOnly = true)
    fun findBatch(userId: UUID): ProfileBatch? {
        val profile = profileRepository.findByUserId(userId)
        val settledBefore = clock.instant().minus(properties.settleDelay)
        val notes = noteStore.findNotesAfter(userId, profile?.notesThrough, settledBefore, properties.batchMaxNotes)
        val batch = ProfileNoteBatch.take(notes, properties.batchMaxChars)
        val last = batch.lastOrNull() ?: return null
        return ProfileBatch(
            profile = profile?.content,
            profileVersion = profile?.version,
            notes = batch,
            through = NotesMark(last.updatedAt, last.id),
            remain = batch.size < notes.size || notes.size == properties.batchMaxNotes,
        )
    }

    /**
     * Saves [content] as the profile that has read [batch], and queues the next batch while notes remain. A batch read
     * from another version of the profile is dropped: another run saved meanwhile, and its notes would be mixed in or
     * lost. A concurrent first save fails on the unique user and is retried from the saved profile.
     */
    @Transactional
    fun save(userId: UUID, batch: ProfileBatch, content: String) {
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

    /** Flags the profile for a full rebuild when it may hold text of [noteIds]; call before deleting them. */
    @Transactional(propagation = Propagation.MANDATORY)
    fun markNotesDeleted(userId: UUID, noteIds: Collection<UUID>) {
        if (noteIds.isEmpty()) return
        noteStore.markDeleted(userId, noteIds, clock.instant())
    }

    /** Queues a refresh for every user whose profile has settled notes to read; one already waiting is reused. */
    @Transactional
    fun requestRefreshes() {
        val users = noteStore.findUsersToRefresh(clock.instant().minus(properties.settleDelay))
        // one order for every transaction: two runs upserting the same events cannot deadlock
        users.sorted().forEach(::requestRefresh)
        log.info("queued profile refresh for ${users.size} users", "requestRefreshes")
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
