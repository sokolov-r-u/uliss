package io.uliss.note_service

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.UserProfileRefreshRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.UserProfileRepository
import io.uliss.note_service.service.handler.UserProfileRefreshRequestedHandler
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import tools.jackson.databind.ObjectMapper
import java.sql.Timestamp
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class UserProfileRefreshIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var handler: UserProfileRefreshRequestedHandler

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var profileRepository: UserProfileRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var objectMapper: ObjectMapper

    private val userId = UUID.randomUUID()
    private val request = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
    private val response = Mockito.mock(ChatClient.CallResponseSpec::class.java)

    @Test
    fun `the first event builds the profile from the notes, the next one folds a new note into it`() {
        note("Jazz", "Coltrane is my favorite.", Instant.now().minus(2, ChronoUnit.HOURS))
        stubModel("## Interests\nJazz.", "## Interests\nJazz and opera.")

        handler.handle(event())
        note("Opera", "Tosca moved me.", Instant.now().minus(1, ChronoUnit.HOURS))
        handler.handle(event())
        handler.handle(event())

        assertEquals("## Interests\nJazz and opera.", profileRepository.findByUserId(userId)!!.content)
        val users = Mockito.mockingDetails(request).invocations.filter { it.method.name == "user" }
            .map { it.arguments[0] as String }
        assertEquals(2, users.size, "the third event finds nothing new and calls no model")
        assertTrue(users[1].contains("## Interests\nJazz.") && users[1].contains("Tosca moved me."))
        assertTrue("Coltrane" !in users[1], "a note the profile has read is not sent again")
    }

    private fun stubModel(vararg answers: String) {
        Mockito.`when`(chatClient.prompt()).thenReturn(request)
        Mockito.`when`(request.system(anyValue<String>())).thenReturn(request)
        Mockito.`when`(request.user(anyValue<String>())).thenReturn(request)
        Mockito.`when`(request.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(request)
        Mockito.`when`(request.call()).thenReturn(response)
        Mockito.`when`(response.content()).thenReturn(answers.first(), *answers.drop(1).toTypedArray())
    }

    private fun note(title: String, content: String, updatedAt: Instant) {
        val note = noteRepository.saveAndFlush(NoteEntity(userId, content, title = title))
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(updatedAt), note.id)
    }

    private fun event() = OutboxEventEntity(
        type = OutboxEventType.USER_PROFILE_REFRESH_REQUESTED,
        payload = objectMapper.writeValueAsString(UserProfileRefreshRequestedPayload(userId)),
        status = OutboxEventStatus.PROCESSING,
        attempts = 0,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )
}
