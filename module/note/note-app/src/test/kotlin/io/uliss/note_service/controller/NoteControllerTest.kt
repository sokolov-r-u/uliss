package io.uliss.note_service.controller

import io.uliss.note_service.dto.internal.NotePlace
import io.uliss.note_service.dto.internal.NoteSearchHit
import io.uliss.note_service.exception.NoteHasSubNotesException
import io.uliss.note_service.exception.NoteMoveCycleException
import io.uliss.note_service.model.SubNoteFate
import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.model.projection.NoteNode
import io.uliss.note_service.service.NoteHierarchyService
import io.uliss.exception.common.NotFoundException
import io.uliss.exception.handler.GlobalExceptionHandler
import io.uliss.note_service.dto.internal.NoteAiEditEvent
import io.uliss.note_service.dto.response.NoteResponse
import io.uliss.note_service.dto.response.NoteStatusResponse
import io.uliss.note_service.exception.NoteNotReadyException
import io.uliss.note_service.exception.NoteUpdatingException
import io.uliss.note_service.exception.NoteVersionConflictException
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.service.NoteAiEditService
import io.uliss.note_service.service.NotePlacementService
import io.uliss.note_service.service.NoteService
import io.uliss.note_service.service.facade.NoteFacade
import io.uliss.security.config.CorsProperties
import io.uliss.security.config.OnboardingGuardConfig
import io.uliss.security.config.SecurityConfig
import io.uliss.security.config.WebMvcPathPrefixConfig
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
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import reactor.core.publisher.Flux
import java.time.Instant
import java.util.UUID

@WebMvcTest(NoteController::class)
@Import(
    SecurityConfig::class,
    CorsProperties::class,
    WebMvcPathPrefixConfig::class,
    OnboardingGuardConfig::class,
    GlobalExceptionHandler::class,
)
class NoteControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockitoBean
    lateinit var noteService: NoteService

    @MockitoBean
    lateinit var noteFacade: NoteFacade

    @MockitoBean
    lateinit var noteAiEditService: NoteAiEditService

    @MockitoBean
    lateinit var notePlacementService: NotePlacementService

    @MockitoBean
    lateinit var noteHierarchyService: NoteHierarchyService

    @MockitoBean
    lateinit var jwtDecoder: JwtDecoder

    @Test
    fun `unauthenticated note list request is rejected with 401`() {
        mockMvc.get("/note/notes").andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `user with blocking onboarding pending is refused`() {
        mockMvc.get("/note/notes") {
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()).claim("onboardingRequired", true) })
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.code") { value("ONBOARDING_REQUIRED") }
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
                    title = null,
                    content = null,
                    createdAt = createdAt,
                    updatedAt = createdAt,
                    updating = false,
                    version = 0,
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
                NoteStatusResponse(noteId, NoteStatus.GENERATING, updatedAt, false),
                NoteStatusResponse(noteId, NoteStatus.READY, updatedAt, false),
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

    @Test
    fun `renameNote returns the renamed note`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteService.renameNote(userId, noteId, "New"))
            .thenReturn(NoteResponse(noteId, NoteSource.CHAT_SUMMARY, NoteStatus.READY, "New", "body", null, null, false, 1))

        mockMvc.patch("/note/notes/$noteId") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"New"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("New") }
        }
    }

    @Test
    fun `renameNote rejects a blank body title with 400`() {
        mockMvc.patch("/note/notes/${UUID.randomUUID()}") {
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"  "}"""
        }.andExpect {
            status { isBadRequest() }
        }
        Mockito.verifyNoInteractions(noteService)
    }

    @Test
    fun `renameNote maps a note that is not ready to 409`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteService.renameNote(userId, noteId, "New")).thenThrow(NoteNotReadyException(noteId))

        mockMvc.patch("/note/notes/$noteId") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"New"}"""
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test
    fun `updateNote returns the saved note with its new version`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteService.updateNote(userId, noteId, "New", "## Body", 3)).thenReturn(
            NoteResponse(noteId, NoteSource.CHAT_SUMMARY, NoteStatus.READY, "New", "## Body", null, null, false, 4)
        )

        mockMvc.put("/note/notes/$noteId") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"New","content":"## Body","version":3}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.content") { value("## Body") }
            jsonPath("$.version") { value(4) }
        }
    }

    @Test
    fun `updateNote rejects a body without a version with 400`() {
        mockMvc.put("/note/notes/${UUID.randomUUID()}") {
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"New","content":"body"}"""
        }.andExpect {
            status { isBadRequest() }
        }
        Mockito.verifyNoInteractions(noteService)
    }

    @Test
    fun `updateNote rejects blank content with 400`() {
        mockMvc.put("/note/notes/${UUID.randomUUID()}") {
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"New","content":"  ","version":0}"""
        }.andExpect {
            status { isBadRequest() }
        }
        Mockito.verifyNoInteractions(noteService)
    }

    @Test
    fun `updateNote maps each refusal to 409 with its own code`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        val refusals = listOf(
            NoteNotReadyException(noteId) to "NOTE_NOT_READY",
            NoteUpdatingException(noteId) to "NOTE_UPDATING",
            NoteVersionConflictException(noteId) to "NOTE_VERSION_CONFLICT",
        )
        for ((refusal, code) in refusals) {
            Mockito.doThrow(refusal).`when`(noteService).updateNote(userId, noteId, "New", "body", 1)

            mockMvc.put("/note/notes/$noteId") {
                with(jwt().jwt { it.claim("userId", userId.toString()) })
                contentType = MediaType.APPLICATION_JSON
                content = """{"title":"New","content":"body","version":1}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value(code) }
            }
        }
    }

    @Test
    fun `deleteNote returns 204 and passes the choice for sub-notes`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()

        mockMvc.delete("/note/notes/$noteId") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { status { isNoContent() } }
        mockMvc.delete("/note/notes/$noteId?subNotes=KEEP") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { status { isNoContent() } }

        Mockito.verify(noteHierarchyService).delete(userId, noteId, null)
        Mockito.verify(noteHierarchyService).delete(userId, noteId, SubNoteFate.KEEP)
    }

    @Test
    fun `deleteNote maps a missing note to 404, sub-notes without a choice to 409, an unknown choice to 400`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        val other = UUID.randomUUID()
        Mockito.doThrow(NotFoundException("note id=$noteId not found")).`when`(noteHierarchyService)
            .delete(userId, noteId, null)
        Mockito.doThrow(NoteHasSubNotesException(other)).`when`(noteHierarchyService).delete(userId, other, null)

        mockMvc.delete("/note/notes/$noteId") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { status { isNotFound() } }
        mockMvc.delete("/note/notes/$other") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("NOTE_HAS_SUB_NOTES") }
        }
        mockMvc.delete("/note/notes/$other?subNotes=MAYBE") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `moving under a note returns the note's place, a cycle is 409`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        val parent = NoteNode(UUID.randomUUID(), null, "Bowie", Instant.EPOCH)
        val constellationId = UUID.randomUUID()
        Mockito.`when`(noteHierarchyService.moveUnder(userId, noteId, parent.id)).thenReturn(
            NotePlace(listOf(parent), listOf(NoteMembership(constellationId, true, Instant.EPOCH))),
        )
        Mockito.`when`(noteHierarchyService.moveUnder(userId, noteId, noteId)).thenThrow(NoteMoveCycleException(noteId, noteId))

        mockMvc.put("/note/notes/$noteId/parent") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"parentNoteId":"${parent.id}"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.ancestors[0].id") { value(parent.id.toString()) }
            jsonPath("$.ancestors[0].title") { value("Bowie") }
            jsonPath("$.constellations[0].constellationId") { value(constellationId.toString()) }
            jsonPath("$.constellations[0].main") { value(true) }
        }
        mockMvc.put("/note/notes/$noteId/parent") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"parentNoteId":"$noteId"}"""
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("NOTE_MOVE_CYCLE") }
        }
        mockMvc.put("/note/notes/$noteId/parent") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `moving out passes the optional target constellation`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        val target = UUID.randomUUID()
        Mockito.`when`(noteHierarchyService.moveOut(userId, noteId, target)).thenReturn(NotePlace(emptyList(), emptyList()))
        Mockito.`when`(noteHierarchyService.moveOut(userId, noteId, null)).thenReturn(NotePlace(emptyList(), emptyList()))

        mockMvc.delete("/note/notes/$noteId/parent?moveTo=$target") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$.ancestors") { isEmpty() }
        }
        mockMvc.delete("/note/notes/$noteId/parent") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { status { isOk() } }

        Mockito.verify(noteHierarchyService).moveOut(userId, noteId, target)
        Mockito.verify(noteHierarchyService).moveOut(userId, noteId, null)
    }

    @Test
    fun `search returns note hits with their path and main constellation`() {
        val userId = UUID.randomUUID()
        val bowie = NoteNode(UUID.randomUUID(), null, "Bowie", Instant.EPOCH)
        val low = NoteNode(UUID.randomUUID(), bowie.id, "Low", Instant.EPOCH)
        val exclude = UUID.randomUUID()
        val constellationId = UUID.randomUUID()
        Mockito.`when`(noteHierarchyService.search(userId, "lo", exclude))
            .thenReturn(listOf(NoteSearchHit(low, listOf(bowie), constellationId)))

        mockMvc.get("/note/notes/search?q=lo&exclude=$exclude") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(low.id.toString()) }
            jsonPath("$[0].title") { value("Low") }
            jsonPath("$[0].ancestors[0].title") { value("Bowie") }
            jsonPath("$[0].constellationId") { value(constellationId.toString()) }
        }
    }

    @Test
    fun `a note's place and sub-notes are readable`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        val child = NoteResponse(UUID.randomUUID(), NoteSource.MANUAL, NoteStatus.READY, "Low", "body", null, null, false, 1, noteId)
        Mockito.`when`(noteHierarchyService.getPlace(userId, noteId)).thenReturn(NotePlace(emptyList(), emptyList()))
        Mockito.`when`(noteService.getSubNotes(userId, noteId)).thenReturn(listOf(child))

        mockMvc.get("/note/notes/$noteId/place") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$.constellations") { isEmpty() }
        }
        mockMvc.get("/note/notes/$noteId/sub-notes") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(child.id.toString()) }
            jsonPath("$[0].parentNoteId") { value(noteId.toString()) }
        }
    }

    @Test
    fun `aiEdit streams the rewrite as JSON appends and ends with done`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteAiEditService.streamRewrite(userId, noteId, "Fix spelling", "body")).thenReturn(
            Flux.just(
                NoteAiEditEvent.AppendText("line\n  indented"),
                NoteAiEditEvent.AppendText(" end"),
                NoteAiEditEvent.Completed,
            )
        )

        aiEdit(userId, noteId, """{"instruction":"Fix spelling","content":"body"}""").asyncDispatch().andExpect {
            status { isOk() }
            content {
                contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)
                string(Matchers.containsString("event:append\ndata:{\"text\":\"line\\n  indented\"}\n\n"))
                string(Matchers.containsString("event:append\ndata:{\"text\":\" end\"}\n\n"))
                string(Matchers.endsWith("event:done\ndata:\n\n"))
            }
        }
    }

    @Test
    fun `aiEdit reports a failed rewrite as an error event`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        Mockito.`when`(noteAiEditService.streamRewrite(userId, noteId, "Fix", "body"))
            .thenReturn(Flux.just(NoteAiEditEvent.AppendText("par"), NoteAiEditEvent.Failed))

        aiEdit(userId, noteId, """{"instruction":"Fix","content":"body"}""").asyncDispatch().andExpect {
            status { isOk() }
            content {
                string(Matchers.endsWith("event:error\ndata:FAILED\n\n"))
                string(Matchers.not(Matchers.containsString("event:done")))
            }
        }
    }

    @Test
    fun `aiEdit rejects a blank or oversized instruction or content with 400 before calling the service`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        val bodies = listOf(
            """{"instruction":"  ","content":"body"}""",
            """{"instruction":"${"a".repeat(1_001)}","content":"body"}""",
            """{"instruction":"Fix","content":" "}""",
            """{"instruction":"Fix","content":"${"a".repeat(30_001)}"}""",
            """{"content":"body"}""",
        )
        for (body in bodies) {
            aiEdit(userId, noteId, body).andExpect { status { isBadRequest() } }
        }
        Mockito.verifyNoInteractions(noteAiEditService)
    }

    @Test
    fun `aiEdit accepts an instruction and content exactly at their limits`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        val instruction = "a".repeat(1_000)
        val content = "b".repeat(30_000)
        Mockito.`when`(noteAiEditService.streamRewrite(userId, noteId, instruction, content))
            .thenReturn(Flux.just(NoteAiEditEvent.Completed))

        aiEdit(userId, noteId, """{"instruction":"$instruction","content":"$content"}""").asyncDispatch()
            .andExpect { status { isOk() } }
    }

    @Test
    fun `aiEdit maps refusals before the stream to their status and code`() {
        val userId = UUID.randomUUID()
        val noteId = UUID.randomUUID()
        val refusals = listOf(
            NoteNotReadyException(noteId) to "NOTE_NOT_READY",
            NoteUpdatingException(noteId) to "NOTE_UPDATING",
        )
        for ((refusal, code) in refusals) {
            Mockito.doThrow(refusal).`when`(noteAiEditService).streamRewrite(userId, noteId, "Fix", "body")

            aiEdit(userId, noteId, """{"instruction":"Fix","content":"body"}""").andExpect {
                status { isConflict() }
                jsonPath("$.code") { value(code) }
            }
        }
        Mockito.doThrow(NotFoundException("note id=$noteId not found"))
            .`when`(noteAiEditService).streamRewrite(userId, noteId, "Fix", "body")
        aiEdit(userId, noteId, """{"instruction":"Fix","content":"body"}""").andExpect { status { isNotFound() } }
    }

    private fun aiEdit(userId: UUID, noteId: UUID, body: String) = mockMvc.post("/note/notes/$noteId/ai-edit") {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
        contentType = MediaType.APPLICATION_JSON
        // As the web client sends it: refusals before the stream come back as JSON.
        header("Accept", "text/event-stream, application/json")
        content = body
    }
}
