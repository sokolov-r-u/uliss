package io.uliss.note_service.controller

import io.uliss.note_service.dto.internal.NoteAiEditEvent
import io.uliss.note_service.dto.request.AddNoteConstellationRequest
import io.uliss.note_service.dto.request.AiEditNoteRequest
import io.uliss.note_service.dto.request.MainNoteConstellationRequest
import io.uliss.note_service.dto.request.MoveUnderNoteRequest
import io.uliss.note_service.dto.request.RenameRequest
import io.uliss.note_service.dto.request.UpdateNoteRequest
import io.uliss.note_service.dto.response.AssistantTextChunkResponse
import io.uliss.note_service.dto.response.ChatResponse
import io.uliss.note_service.dto.response.NoteConstellationResponse
import io.uliss.note_service.dto.response.NotePlaceResponse
import io.uliss.note_service.dto.response.NoteResponse
import io.uliss.note_service.dto.response.NoteSearchHitResponse
import io.uliss.note_service.dto.response.NoteStatusResponse
import io.uliss.note_service.dto.response.toResponse
import io.uliss.note_service.model.SubNoteFate
import io.uliss.note_service.service.NoteAiEditService
import io.uliss.note_service.service.NoteHierarchyService
import io.uliss.note_service.service.NotePlacementService
import io.uliss.note_service.service.NoteService
import io.uliss.note_service.service.facade.NoteFacade
import io.uliss.note_service.util.withHeartbeat
import io.uliss.security.utils.getUserId
import jakarta.validation.Valid
import java.time.Duration
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.codec.ServerSentEvent
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import reactor.core.publisher.Flux

@RestController
@RequestMapping("/notes")
class NoteController(
    private val noteService: NoteService,
    private val noteFacade: NoteFacade,
    private val noteAiEditService: NoteAiEditService,
    private val notePlacementService: NotePlacementService,
    private val noteHierarchyService: NoteHierarchyService,
    @param:Value($$"${note.sse.heartbeat-interval:15s}") private val heartbeatInterval: Duration,
) {

    @GetMapping
    fun getNotes(@AuthenticationPrincipal jwt: Jwt): List<NoteResponse> =
        noteService.getNotes(jwt.getUserId())

    /** Notes with no constellation and no parent note, newest first. */
    @GetMapping("/without-constellation")
    fun getNotesWithoutConstellation(@AuthenticationPrincipal jwt: Jwt): List<NoteResponse> =
        noteService.getNotesWithoutConstellation(jwt.getUserId())

    /** Titled notes for the place picker; [exclude] leaves out the moving note and its sub-notes. */
    @GetMapping("/search")
    fun searchNotes(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam q: String,
        @RequestParam(required = false) exclude: UUID?,
    ): List<NoteSearchHitResponse> =
        noteHierarchyService.search(jwt.getUserId(), q, exclude).map { it.toResponse() }

    @GetMapping("/{noteId}")
    fun getNote(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
    ): NoteResponse = noteService.getNote(jwt.getUserId(), noteId)

    @GetMapping("/{noteId}/chats")
    fun getNoteChats(@AuthenticationPrincipal jwt: Jwt, @PathVariable noteId: UUID): List<ChatResponse> =
        noteFacade.getNoteChats(jwt.getUserId(), noteId).map { it.toResponse() }

    @GetMapping("/{noteId}/constellations")
    fun getNoteConstellations(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
    ): List<NoteConstellationResponse> =
        notePlacementService.getMemberships(jwt.getUserId(), noteId).map { it.toResponse() }

    /** Where the note lives: its parent notes and the constellations of its top note. */
    @GetMapping("/{noteId}/place")
    fun getNotePlace(@AuthenticationPrincipal jwt: Jwt, @PathVariable noteId: UUID): NotePlaceResponse =
        noteHierarchyService.getPlace(jwt.getUserId(), noteId).toResponse()

    /** The note's direct sub-notes, newest first. */
    @GetMapping("/{noteId}/sub-notes")
    fun getSubNotes(@AuthenticationPrincipal jwt: Jwt, @PathVariable noteId: UUID): List<NoteResponse> =
        noteService.getSubNotes(jwt.getUserId(), noteId)

    /** Moves the note under another note; it drops its own constellations and lives where the parent lives. */
    @PutMapping("/{noteId}/parent")
    fun moveNoteUnder(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
        @Valid @RequestBody request: MoveUnderNoteRequest,
    ): NotePlaceResponse =
        // Validated as @NotNull before the call.
        noteHierarchyService.moveUnder(jwt.getUserId(), noteId, checkNotNull(request.parentNoteId)).toResponse()

    /** Moves a sub-note out: into [moveTo] as its only, main constellation, or without a place. */
    @DeleteMapping("/{noteId}/parent")
    fun moveNoteOut(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
        @RequestParam(required = false) moveTo: UUID?,
    ): NotePlaceResponse = noteHierarchyService.moveOut(jwt.getUserId(), noteId, moveTo).toResponse()

    /** Adds the note to a constellation; the first one becomes main. Returns the note's constellations. */
    @PostMapping("/{noteId}/constellations")
    fun addNoteConstellation(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
        @Valid @RequestBody request: AddNoteConstellationRequest,
    ): List<NoteConstellationResponse> =
        // Validated as @NotNull before the call.
        notePlacementService.add(jwt.getUserId(), noteId, checkNotNull(request.constellationId))
            .map { it.toResponse() }

    @PutMapping("/{noteId}/constellations/main")
    fun setMainNoteConstellation(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
        @Valid @RequestBody request: MainNoteConstellationRequest,
    ): List<NoteConstellationResponse> =
        // Validated as @NotNull before the call.
        notePlacementService.makeMain(jwt.getUserId(), noteId, checkNotNull(request.constellationId), request.replace)
            .map { it.toResponse() }

    /** Removes the note from a constellation; a removed main promotes the oldest remaining one. */
    @DeleteMapping("/{noteId}/constellations/{constellationId}")
    fun removeNoteConstellation(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
        @PathVariable constellationId: UUID,
    ): List<NoteConstellationResponse> =
        notePlacementService.remove(jwt.getUserId(), noteId, constellationId).map { it.toResponse() }

    @PatchMapping("/{noteId}")
    fun renameNote(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
        @Valid @RequestBody request: RenameRequest,
    ): NoteResponse = noteService.renameNote(jwt.getUserId(), noteId, request.title)

    @PutMapping("/{noteId}")
    fun updateNote(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
        @Valid @RequestBody request: UpdateNoteRequest,
    ): NoteResponse = noteService.updateNote(
        jwt.getUserId(),
        noteId,
        request.title,
        request.content,
        // Validated as @NotNull before the call.
        checkNotNull(request.version),
    )

    /** Streams a model rewrite of [AiEditNoteRequest.content]; refusals come back as JSON before the stream opens. */
    @PostMapping("/{noteId}/ai-edit", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun aiEditNote(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
        @Valid @RequestBody request: AiEditNoteRequest,
    ): Flux<ServerSentEvent<Any>> =
        noteAiEditService.streamRewrite(jwt.getUserId(), noteId, request.instruction, request.content)
            .map(::toServerSentEvent)
            .withHeartbeat(heartbeatInterval)

    /** A note with sub-notes needs [subNotes]: keep them in its place or delete the whole subtree. */
    @DeleteMapping("/{noteId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteNote(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
        @RequestParam(required = false) subNotes: SubNoteFate?,
    ) {
        noteHierarchyService.delete(jwt.getUserId(), noteId, subNotes)
    }

    @GetMapping("/{noteId}/status/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamNoteStatus(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
    ): Flux<ServerSentEvent<NoteStatusResponse>> =
        noteService.streamNoteStatus(jwt.getUserId(), noteId)
            .map { status -> ServerSentEvent.builder(status).event("status").build() }
            .withHeartbeat(heartbeatInterval)

    private fun toServerSentEvent(event: NoteAiEditEvent): ServerSentEvent<Any> = when (event) {
        is NoteAiEditEvent.AppendText ->
            ServerSentEvent.builder<Any>(AssistantTextChunkResponse(event.text)).event("append").build()

        NoteAiEditEvent.Completed -> ServerSentEvent.builder<Any>("").event("done").build()
        NoteAiEditEvent.Failed -> ServerSentEvent.builder<Any>("FAILED").event("error").build()
    }

}
