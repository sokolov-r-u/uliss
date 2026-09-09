package io.uliss.note_service.controller

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.exception.handler.GlobalExceptionHandler
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.service.ChatFacade
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
import org.springframework.test.web.servlet.post
import reactor.core.publisher.Flux
import java.time.Instant
import java.util.UUID

// SecurityConfig/CorsProperties/GlobalExceptionHandler imported explicitly: @WebMvcTest does not
// auto-load third-party AutoConfiguration.imports entries, only beans it discovers itself.
@WebMvcTest(ChatController::class)
@Import(SecurityConfig::class, CorsProperties::class, GlobalExceptionHandler::class)
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
    fun `sendMessage with blank content is rejected with 400`() {
        val chatId = UUID.randomUUID()
        mockMvc.post("/note/chats/$chatId/messages") {
            with(jwt())
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":""}"""
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `sendMessage happy path returns the assistant's reply`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatFacade.sendMessage(userId, chatId, "6*7?"))
            .thenReturn(ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "42", ChatMessageStatus.COMPLETE))

        mockMvc.post("/note/chats/$chatId/messages") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"6*7?"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.content") { value("42") }
            jsonPath("$.role") { value("ASSISTANT") }
            jsonPath("$.status") { value("COMPLETE") }
        }
    }

    @Test
    fun `streamMessage happy path emits token and done SSE events`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatFacade.streamMessage(userId, chatId, "hi")).thenReturn(Flux.just("Hel", "lo"))

        mockMvc.post("/note/chats/$chatId/messages/stream") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"hi"}"""
        }.asyncDispatch().andExpect {
            status { isOk() }
            content {
                contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)
                string(Matchers.containsString("event:token"))
                string(Matchers.containsString("event:done"))
            }
        }
    }

    @Test
    fun `streamMessage surfaces a mid-stream failure as an error SSE event, never a done event`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatFacade.streamMessage(userId, chatId, "hi"))
            .thenReturn(Flux.concat(Flux.just("Hi"), Flux.error(RuntimeException("boom"))))

        mockMvc.post("/note/chats/$chatId/messages/stream") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"hi"}"""
        }.asyncDispatch().andExpect {
            status { isOk() }
            content {
                string(Matchers.containsString("event:token"))
                string(Matchers.containsString("event:error"))
                string(Matchers.not(Matchers.containsString("event:done")))
            }
        }
    }

    @Test
    fun `summarizeChat accepts generation and returns the placeholder location`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val createdAt = Instant.parse("2026-09-09T10:15:30Z")
        val note = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING).apply {
            this.createdAt = createdAt
        }
        Mockito.`when`(chatFacade.requestSummary(userId, chatId)).thenReturn(note)

        mockMvc.post("/note/chats/$chatId/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isAccepted() }
            header { string("Location", "/note/notes/${note.id}") }
            jsonPath("$.noteId") { value(note.id.toString()) }
            jsonPath("$.chatId") { value(chatId.toString()) }
            jsonPath("$.status") { value("GENERATING") }
            jsonPath("$.createdAt") { value("2026-09-09T10:15:30Z") }
            jsonPath("$.content") { doesNotExist() }
        }
    }

    @Test
    fun `summarizeChat for a chat owned by another user returns 404`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatFacade.requestSummary(userId, chatId))
            .thenThrow(NotFoundException("chat id=$chatId not found"))

        mockMvc.post("/note/chats/$chatId/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `summarizeChat for a chat with no messages returns 400`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatFacade.requestSummary(userId, chatId))
            .thenThrow(BadRequestException("chat id=$chatId has no messages to summarize"))

        mockMvc.post("/note/chats/$chatId/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isBadRequest() }
        }
    }
}
