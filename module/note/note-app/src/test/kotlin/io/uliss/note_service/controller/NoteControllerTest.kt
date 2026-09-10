package io.uliss.note_service.controller

import io.uliss.exception.common.NotFoundException
import io.uliss.exception.handler.GlobalExceptionHandler
import io.uliss.note_service.dto.NoteResponse
import io.uliss.note_service.dto.NoteStatusResponse
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.service.NoteService
import io.uliss.security.config.CorsProperties
import io.uliss.security.config.SecurityConfig
import org.hamcrest.Matchers
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import reactor.core.publisher.Flux
import java.time.Instant
import java.util.UUID

@WebMvcTest(NoteController::class)
@Import(SecurityConfig::class, CorsProperties::class, GlobalExceptionHandler::class)
class NoteControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockitoBean
    lateinit var noteService: NoteService

    @MockitoBean
    lateinit var jwtDecoder: JwtDecoder

    @Test
    fun `unauthenticated note list request is rejected with 401`() {
        mockMvc.get("/note/notes").andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `getNotes returns persisted lifecycle state`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        val createdAt = Instant.parse("2026-09-10T10:15:30Z")
        Mockito.`when`(noteService.getNotes(userId)).thenReturn(
            listOf(
                NoteResponse(
                    id = noteId,
                    source = NoteSource.CHAT_SUMMARY,
                    status = NoteStatus.GENERATING,
                    content = null,
                    createdAt = createdAt,
                    updatedAt = createdAt,
                )
            )
        )

        mockMvc.get("/note/notes") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(noteId.toString()) }
            jsonPath("$[0].chatId") { doesNotExist() }
            jsonPath("$[0].source") { value("CHAT_SUMMARY") }
            jsonPath("$[0].status") { value("GENERATING") }
            jsonPath("$[0].content") { value(Matchers.nullValue()) }
            jsonPath("$[0].createdAt") { value("2026-09-10T10:15:30Z") }
        }
    }

    @Test
    fun `getNote for a missing or foreign note returns 404`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteService.getNote(userId, noteId))
            .thenThrow(NotFoundException("note id=$noteId not found"))

        mockMvc.get("/note/notes/$noteId") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `streamNoteStatus emits status events and completes on terminal state`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        val updatedAt = Instant.parse("2026-09-10T10:15:30Z")
        Mockito.`when`(noteService.streamNoteStatus(userId, noteId)).thenReturn(
            Flux.just(
                NoteStatusResponse(noteId, NoteStatus.GENERATING, updatedAt),
                NoteStatusResponse(noteId, NoteStatus.READY, updatedAt),
            )
        )

        mockMvc.get("/note/notes/$noteId/status/stream") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            accept = MediaType.TEXT_EVENT_STREAM
        }.asyncDispatch().andExpect {
            status { isOk() }
            content {
                contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)
                string(Matchers.containsString("event:status"))
                string(Matchers.containsString("\"status\":\"GENERATING\""))
                string(Matchers.containsString("\"status\":\"READY\""))
                string(Matchers.not(Matchers.containsString("content")))
            }
        }
    }

    @Test
    fun `streamNoteStatus for a missing or foreign note returns 404 before opening a stream`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteService.streamNoteStatus(userId, noteId))
            .thenThrow(NotFoundException("note id=$noteId not found"))

        mockMvc.get("/note/notes/$noteId/status/stream") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isNotFound() }
        }
    }
}
