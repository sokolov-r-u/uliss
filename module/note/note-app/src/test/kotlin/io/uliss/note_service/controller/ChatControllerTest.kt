package io.uliss.note_service.controller

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.InternalException
import io.uliss.exception.common.NotFoundException
import io.uliss.exception.handler.GlobalExceptionHandler
import io.uliss.note_service.anyValue
import io.uliss.note_service.exception.IdempotencyKeyReusedException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.service.ChatFacade
import io.uliss.note_service.service.type.AssistantStreamEvent
import io.uliss.security.config.CorsProperties
import io.uliss.security.config.SecurityConfig
import org.hamcrest.Matchers
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.system.CapturedOutput
import org.springframework.boot.test.system.OutputCaptureExtension
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import reactor.core.publisher.Flux
import java.time.Instant
import java.util.UUID
import kotlin.test.assertTrue

// SecurityConfig/CorsProperties/GlobalExceptionHandler imported explicitly: @WebMvcTest does not
// auto-load third-party AutoConfiguration.imports entries, only beans it discovers itself.
@WebMvcTest(ChatController::class)
@Import(SecurityConfig::class, CorsProperties::class, GlobalExceptionHandler::class)
@ExtendWith(OutputCaptureExtension::class)
class ChatControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockitoBean
    lateinit var chatFacade: ChatFacade

    // Required for SecurityConfig's oauth2ResourceServer{jwt{}} to build; requests authenticate via
    // the jwt() request post-processor instead, so decode() is never actually invoked.
    @MockitoBean
    lateinit var jwtDecoder: JwtDecoder

    @Test
    fun `unauthenticated request is rejected with 401`() {
        mockMvc.post("/note/chats") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"hi"}"""
        }.andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `createChat with a too-long title is rejected with 400`() {
        mockMvc.post("/note/chats") {
            with(jwt())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"${"a".repeat(256)}"}"""
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `createChat happy path returns 201 and the created chat`() {
        val userId = UUID.randomUUID()
        Mockito.`when`(chatFacade.createChat(userId, "Trip planning"))
            .thenReturn(ChatEntity(userId, "Trip planning"))

        mockMvc.post("/note/chats") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Trip planning"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.title") { value("Trip planning") }
        }
    }

    @Test
    fun `getChats returns the user's chats`() {
        val userId = UUID.randomUUID()
        Mockito.`when`(chatFacade.getChats(userId)).thenReturn(listOf(ChatEntity(userId, "Trip planning")))

        mockMvc.get("/note/chats") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].title") { value("Trip planning") }
        }
    }

    @Test
    fun `getMessages happy path returns the ordered history`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val message = ChatMessageEntity(chatId, ChatMessageRole.USER, "hi", ChatMessageStatus.COMPLETE)
        Mockito.`when`(chatFacade.getMessages(userId, chatId)).thenReturn(listOf(message))

        mockMvc.get("/note/chats/$chatId/messages") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].content") { value("hi") }
        }
    }

    @Test
    fun `getMessages for a chat owned by another user returns 404`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatFacade.getMessages(userId, chatId))
            .thenThrow(NotFoundException("chat id=$chatId not found"))

        mockMvc.get("/note/chats/$chatId/messages") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `streamMessage with blank content is rejected with 400`() {
        val chatId = UUID.randomUUID()
        mockMvc.post("/note/chats/$chatId/messages/stream") {
            with(jwt())
            header("Idempotency-Key", UUID.randomUUID())
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":""}"""
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `streamMessage happy path emits token and done SSE events`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        Mockito.`when`(chatFacade.streamMessage(userId, chatId, turnId, "hi"))
            .thenReturn(
                Flux.just(
                    AssistantStreamEvent.AppendText("Hel"),
                    AssistantStreamEvent.AppendText("lo"),
                    AssistantStreamEvent.GenerationCompleted,
                )
            )

        mockMvc.post("/note/chats/$chatId/messages/stream") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", turnId)
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"hi"}"""
        }.asyncDispatch().andExpect {
            status { isOk() }
            header { string("Idempotency-Key", turnId.toString()) }
            content {
                contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)
                string(Matchers.containsString("event:append"))
                string(Matchers.containsString("event:done"))
            }
        }
    }

    @Test
    fun `streamMessage surfaces a mid-stream failure as an error SSE event, never a done event`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        Mockito.`when`(chatFacade.streamMessage(userId, chatId, turnId, "hi"))
            .thenReturn(
                Flux.concat(
                    Flux.just(AssistantStreamEvent.AppendText("Hi")),
                    Flux.error(RuntimeException("boom")),
                )
            )

        mockMvc.post("/note/chats/$chatId/messages/stream") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", turnId)
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"hi"}"""
        }.asyncDispatch().andExpect {
            status { isOk() }
            content {
                string(Matchers.containsString("event:append"))
                string(Matchers.containsString("event:error"))
                string(Matchers.not(Matchers.containsString("event:done")))
            }
        }
    }

    @Test
    fun `streamMessage requires a valid idempotency key`() {
        val chatId = UUID.randomUUID()
        mockMvc.post("/note/chats/$chatId/messages/stream") {
            with(jwt())
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"hi"}"""
        }.andExpect {
            status { isBadRequest() }
        }
        mockMvc.post("/note/chats/$chatId/messages/stream") {
            with(jwt())
            header("Idempotency-Key", "not-a-uuid")
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"hi"}"""
        }.andExpect {
            status { isBadRequest() }
        }
        Mockito.verifyNoInteractions(chatFacade)
    }

    @Test
    fun `streamMessage exposes pending and terminal replay events`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        listOf(
            AssistantStreamEvent.GenerationPending(1500) to "event:pending",
            AssistantStreamEvent.GenerationCompleted to "event:done",
            AssistantStreamEvent.GenerationFailed(io.uliss.note_service.model.ChatTurnStatus.FAILED) to "event:error",
        ).forEach { (event, expectedEvent) ->
            val turnId = UUID.randomUUID()
            Mockito.`when`(chatFacade.streamMessage(userId, chatId, turnId, "hi"))
                .thenReturn(Flux.just(event))

            mockMvc.post("/note/chats/$chatId/messages/stream") {
                with(jwt().jwt { it.claim("userId", userId.toString()) })
                header("Idempotency-Key", turnId)
                contentType = MediaType.APPLICATION_JSON
                content = """{"content":"hi"}"""
            }.asyncDispatch().andExpect {
                status { isOk() }
                content { string(Matchers.containsString(expectedEvent)) }
            }
        }
    }

    @Test
    fun `cancelTurn returns no content`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()

        mockMvc.post("/note/chats/$chatId/turns/$turnId/cancel") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isNoContent() }
        }
        Mockito.verify(chatFacade).cancelTurn(userId, chatId, turnId)
    }

    @Test
    fun `summarizeChat accepts generation and returns the placeholder`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val createdAt = Instant.parse("2026-09-09T10:15:30Z")
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING).apply {
            this.createdAt = createdAt
        }
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(chatFacade.requestSummary(userId, chatId, idempotencyKey)).thenReturn(note)

        mockMvc.post("/note/chats/$chatId/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", idempotencyKey)
        }.andExpect {
            status { isAccepted() }
            header { doesNotExist("Location") }
            header { string("Idempotency-Key", idempotencyKey.toString()) }
            jsonPath("$.noteId") { value(note.id.toString()) }
            jsonPath("$.chatId") { value(chatId.toString()) }
            jsonPath("$.status") { value("GENERATING") }
            jsonPath("$.createdAt") { value("2026-09-09T10:15:30Z") }
            jsonPath("$.content") { doesNotExist() }
        }
    }

    @Test
    fun `summarizeChat requires an idempotency key`() {
        mockMvc.post("/note/chats/${UUID.randomUUID()}/summarize") {
            with(jwt())
        }.andExpect {
            status { isBadRequest() }
        }
        Mockito.verifyNoInteractions(chatFacade)
    }

    @Test
    fun `summarizeChat rejects an invalid idempotency key`() {
        mockMvc.post("/note/chats/${UUID.randomUUID()}/summarize") {
            with(jwt())
            header("Idempotency-Key", "not-a-uuid")
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("BAD_REQUEST_ERROR") }
        }
        Mockito.verifyNoInteractions(chatFacade)
    }

    @Test
    fun `summarizeChat rejects an empty idempotency key`() {
        mockMvc.post("/note/chats/${UUID.randomUUID()}/summarize") {
            with(jwt())
            header("Idempotency-Key", "")
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("BAD_REQUEST_ERROR") }
        }
        Mockito.verifyNoInteractions(chatFacade)
    }

    @Test
    fun `summarizeChat replay preserves the accepted representation for every current note status`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()

        listOf(NoteStatus.GENERATING, NoteStatus.READY, NoteStatus.FAILED).forEach { currentStatus ->
            val idempotencyKey = UUID.randomUUID()
            val note = NoteEntity(userId, "current content", NoteSource.CHAT_SUMMARY, currentStatus)
            Mockito.`when`(chatFacade.requestSummary(userId, chatId, idempotencyKey)).thenReturn(note)

            mockMvc.post("/note/chats/$chatId/summarize") {
                with(jwt().jwt { it.claim("userId", userId.toString()) })
                header("Idempotency-Key", idempotencyKey)
            }.andExpect {
                status { isAccepted() }
                header { string("Idempotency-Key", idempotencyKey.toString()) }
                jsonPath("$.noteId") { value(note.id.toString()) }
                jsonPath("$.status") { value("GENERATING") }
            }
        }
    }

    @Test
    fun `summarizeChat rejects reuse of a key for another chat`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(chatFacade.requestSummary(userId, chatId, idempotencyKey))
            .thenThrow(IdempotencyKeyReusedException())

        mockMvc.post("/note/chats/$chatId/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", idempotencyKey)
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
        }
    }

    @Test
    fun `summarizeChat logs an internal idempotency invariant failure`(output: CapturedOutput) {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val messages = listOf(
            "summary request reservation detected an idempotency conflict, " +
                    "but the request created by the winning transaction could not be loaded",
            "summary request was loaded after an idempotent retry, " +
                    "but its referenced note could not be found",
        )

        messages.forEach { message ->
            val idempotencyKey = UUID.randomUUID()
            Mockito.`when`(chatFacade.requestSummary(userId, chatId, idempotencyKey))
                .thenThrow(InternalException(message))

            mockMvc.post("/note/chats/$chatId/summarize") {
                with(jwt().jwt { it.claim("userId", userId.toString()) })
                header("Idempotency-Key", idempotencyKey)
            }.andExpect {
                status { isInternalServerError() }
                jsonPath("$.code") { value("INTERNAL_ERROR") }
            }
            assertTrue(output.out.contains(message))
        }
    }

    @Test
    fun `summarizeChat for a chat owned by another user returns 404`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatFacade.requestSummary(anyValue(), anyValue(), anyValue()))
            .thenThrow(NotFoundException("chat id=$chatId not found"))

        mockMvc.post("/note/chats/$chatId/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", UUID.randomUUID())
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `summarizeChat for a chat with no messages returns 400`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatFacade.requestSummary(anyValue(), anyValue(), anyValue()))
            .thenThrow(BadRequestException("chat id=$chatId has no messages to summarize"))

        mockMvc.post("/note/chats/$chatId/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", UUID.randomUUID())
        }.andExpect {
            status { isBadRequest() }
        }
    }
}
