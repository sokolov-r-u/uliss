package io.uliss.note_service.service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.dto.response.NoteStatusResponse
import io.uliss.note_service.exception.TooManyStatusStreamsException
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequestStore
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import reactor.core.scheduler.Schedulers
import java.time.Duration
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/** Live status of a note being generated or updated, polled from the database. */
@Service
class NoteStatusService(
    private val noteRepository: NoteRepository,
    private val summaryRequestStore: SummaryRequestStore,
    @param:Value($$"${note.status-stream.max-per-user:5}") private val maxStreamsPerUser: Int,
) {

    private val openStreams = ConcurrentHashMap<UUID, AtomicInteger>()

    /**
     * Refused with 429 when the user already holds [maxStreamsPerUser] open streams (each polls the database every
     * second). A stream takes its slot when it is subscribed and frees it when it ends, fails or is cancelled, so a
     * stream nobody subscribed to holds none. Counted per instance.
     */
    fun streamNoteStatus(userId: UUID, noteId: UUID): Flux<NoteStatusResponse> {
        val initialStatus = getStatus(userId, noteId)
        val count = openStreams.computeIfAbsent(userId) { AtomicInteger() }
        // refused here, before the response opens, so the client gets the JSON error; the slot is taken below
        if (count.get() >= maxStreamsPerUser) throw TooManyStatusStreamsException(maxStreamsPerUser)
        val persistedStatuses = Flux.interval(STATUS_POLL_INTERVAL)
            .concatMap {
                Mono.fromCallable { getStatus(userId, noteId) }
                    .subscribeOn(Schedulers.boundedElastic())
            }

        val statuses = persistedStatuses
            .startWith(initialStatus)
            .distinctUntilChanged { status -> status.status to status.updating }
            // A READY note stays open while its summary update runs, so the reader sees the appended content.
            .takeUntil { status -> status.status.isTerminal() && !status.updating }
            // A note stuck in GENERATING or updating must not hold the connection and its DB polling forever.
            .take(STATUS_STREAM_TIMEOUT)

        return Flux.defer {
            // two streams opened at once may both pass the check above; the one over the limit ends here
            if (count.incrementAndGet() > maxStreamsPerUser) {
                count.decrementAndGet()
                Flux.error(TooManyStatusStreamsException(maxStreamsPerUser))
            } else {
                statuses.doFinally { count.decrementAndGet() }
            }
        }
    }

    /** Pending requests first: an update committing in between reads as updating, never as settled. */
    private fun getStatus(userId: UUID, noteId: UUID): NoteStatusResponse {
        val pending = summaryRequestStore.hasPendingForNote(noteId)
        val note = noteRepository.findStatusByIdAndUserId(noteId, userId)
            ?: throw NotFoundException("note id=$noteId not found")
        // only a READY note can be updating: a GENERATING note's pending request is its creation
        return NoteStatusResponse(note.id, note.status, note.updatedAt, note.status == NoteStatus.READY && pending)
    }

    private fun NoteStatus.isTerminal(): Boolean = this == NoteStatus.READY || this == NoteStatus.FAILED

    private companion object {
        val STATUS_POLL_INTERVAL: Duration = Duration.ofSeconds(1)
        val STATUS_STREAM_TIMEOUT: Duration = Duration.ofMinutes(10)
    }
}
