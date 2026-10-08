package io.uliss.note_service.controller

import io.uliss.note_service.dto.request.RenameRequest
import io.uliss.note_service.dto.response.NoteResponse
import io.uliss.note_service.dto.response.NoteStatusResponse
import io.uliss.note_service.service.NoteService
import io.uliss.security.utils.getUserId
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.codec.ServerSentEvent
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import reactor.core.publisher.Flux
import java.util.UUID

@RestController
@RequestMapping("/notes")
class NoteController(
    private val noteService: NoteService,
) {

    @GetMapping
    fun getNotes(@AuthenticationPrincipal jwt: Jwt): List<NoteResponse> =
        noteService.getNotes(jwt.getUserId())

    @GetMapping("/{noteId}")
    fun getNote(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
    ): NoteResponse = noteService.getNote(jwt.getUserId(), noteId)

    @PatchMapping("/{noteId}")
    fun renameNote(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
        @Valid @RequestBody request: RenameRequest,
    ): NoteResponse = noteService.renameNote(jwt.getUserId(), noteId, request.title)

    @DeleteMapping("/{noteId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteNote(@AuthenticationPrincipal jwt: Jwt, @PathVariable noteId: UUID) {
        noteService.deleteNote(jwt.getUserId(), noteId)
    }

    @GetMapping("/{noteId}/status/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamNoteStatus(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
    ): Flux<ServerSentEvent<NoteStatusResponse>> =
        noteService.streamNoteStatus(jwt.getUserId(), noteId)
            .map { status -> ServerSentEvent.builder(status).event("status").build() }
}
