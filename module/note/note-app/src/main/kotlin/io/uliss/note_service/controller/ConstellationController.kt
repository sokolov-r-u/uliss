package io.uliss.note_service.controller

import io.uliss.note_service.dto.request.CreateConstellationRequest
import io.uliss.note_service.dto.request.MoveConstellationRequest
import io.uliss.note_service.dto.request.UpdateConstellationRequest
import io.uliss.note_service.dto.response.ConstellationDeletionResponse
import io.uliss.note_service.dto.response.ConstellationResponse
import io.uliss.note_service.dto.response.NoteResponse
import io.uliss.note_service.dto.response.toResponse
import io.uliss.note_service.service.ConstellationService
import io.uliss.note_service.service.NoteService
import io.uliss.security.utils.getUserId
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/constellations")
class ConstellationController(
    private val constellationService: ConstellationService,
    private val noteService: NoteService,
) {

    /** The user's whole tree as a flat list; the client builds the tree from `parentId`. */
    @GetMapping
    fun getConstellations(@AuthenticationPrincipal jwt: Jwt): List<ConstellationResponse> =
        constellationService.getTree(jwt.getUserId()).map { it.toResponse() }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun createConstellation(
        @AuthenticationPrincipal jwt: Jwt,
        @Valid @RequestBody request: CreateConstellationRequest,
    ): ConstellationResponse =
        constellationService.create(jwt.getUserId(), request.name, request.parentId).toResponse()

    @PatchMapping("/{constellationId}")
    fun updateConstellation(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable constellationId: UUID,
        @Valid @RequestBody request: UpdateConstellationRequest,
    ): ConstellationResponse = constellationService
        .update(jwt.getUserId(), constellationId, request.name, request.hue, request.lightness)
        .toResponse()

    @PostMapping("/{constellationId}/move")
    fun moveConstellation(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable constellationId: UUID,
        @RequestBody request: MoveConstellationRequest,
    ): ConstellationResponse =
        constellationService.move(jwt.getUserId(), constellationId, request.parentId).toResponse()

    /** The notes of the constellation itself, newest first. */
    @GetMapping("/{constellationId}/notes")
    fun getConstellationNotes(@AuthenticationPrincipal jwt: Jwt, @PathVariable constellationId: UUID): List<NoteResponse> =
        noteService.getNotesInConstellation(jwt.getUserId(), constellationId)

    @GetMapping("/{constellationId}/deletion")
    fun getDeletionImpact(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable constellationId: UUID,
    ): ConstellationDeletionResponse =
        ConstellationDeletionResponse(constellationService.getDeletionImpact(jwt.getUserId(), constellationId))

    /** Notes placed only inside the branch move to [moveTo]; without it they are left without a constellation. */
    @DeleteMapping("/{constellationId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteConstellation(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable constellationId: UUID,
        @RequestParam(required = false) moveTo: UUID?,
    ) {
        constellationService.delete(jwt.getUserId(), constellationId, moveTo)
    }
}
