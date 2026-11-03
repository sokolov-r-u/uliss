package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.anyValue
import io.uliss.note_service.dto.internal.ProfileBatch
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.UserProfileRefreshRequestedPayload
import io.uliss.note_service.model.projection.NotesMark
import io.uliss.note_service.model.projection.ProfileNote
import io.uliss.note_service.service.UserProfileProperties
import io.uliss.note_service.service.UserProfileService
import io.uliss.note_service.service.handler.UserProfileRefreshRequestedHandler
import io.uliss.note_service.util.UserProfilePrompts
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class UserProfileRefreshRequestedHandlerTest {

    private val objectMapper = JsonMapper.builder().build()
    private val chatClient = Mockito.mock(ChatClient::class.java)
    private val profileService = Mockito.mock(UserProfileService::class.java)
    private val properties = UserProfileProperties(maxChars = 100, compactTargetChars = 60)
    private val handler = UserProfileRefreshRequestedHandler(objectMapper, chatClient, profileService, properties)
    private val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
    private val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
    private val userId = UUID.randomUUID()

    @Test
    fun `without a profile the initial prompt reads the batch and its answer is saved`() {
        val batch = batch(profile = null, note("Jazz", "I love Coltrane."))
        Mockito.`when`(profileService.findBatch(userId)).thenReturn(batch)
        stubModel("## Interests\nJazz, Coltrane.")

        handler.handle(event())

        assertEquals(UserProfilePrompts.INITIAL_SYSTEM_PROMPT, prompts("system").single())
        assertTrue(prompts("user").single().contains("I love Coltrane."))
        Mockito.verify(profileService).save(userId, batch, "## Interests\nJazz, Coltrane.")
    }

    @Test
    fun `with a profile the update prompt reads the profile and the batch, and the whole answer replaces it`() {
        val batch = batch(profile = "## Interests\nJazz.", note("Opera", "Went to Tosca, loved it."))
        Mockito.`when`(profileService.findBatch(userId)).thenReturn(batch)
        stubModel("## Interests\nJazz and opera.")

        handler.handle(event())

        assertEquals(UserProfilePrompts.UPDATE_SYSTEM_PROMPT, prompts("system").single())
        val user = prompts("user").single()
        assertTrue(user.contains("## Interests\nJazz."))
        assertTrue(user.contains("Went to Tosca, loved it."))
        Mockito.verify(profileService).save(userId, batch, "## Interests\nJazz and opera.")
    }

    @Test
    fun `a profile over the limit is compacted to the target before it is saved, one under it is not`() {
        val long = "x".repeat(101)
        val batch = batch(profile = "old", note("Opera", "Tosca."))
        Mockito.`when`(profileService.findBatch(userId)).thenReturn(batch)
        stubModel(long, "short")

        handler.handle(event())

        assertEquals(
            listOf(UserProfilePrompts.UPDATE_SYSTEM_PROMPT, UserProfilePrompts.COMPACT_SYSTEM_PROMPT),
            prompts("system"),
        )
        val compactPrompt = prompts("user").last()
        assertTrue(compactPrompt.contains(long))
        assertTrue(compactPrompt.contains("60 characters"))
        Mockito.verify(profileService).save(userId, batch, "short")
    }

    @Test
    fun `a blank answer fails the event and saves nothing, so the batch is read again on retry`() {
        Mockito.`when`(profileService.findBatch(userId)).thenReturn(batch(profile = "old", note("Opera", "Tosca.")))
        stubModel("  \n")

        assertFailsWith<IllegalStateException> { handler.handle(event()) }

        Mockito.verify(profileService, Mockito.never()).save(anyValue(), anyValue(), anyValue())
    }

    @Test
    fun `with no batch left the event calls no model and lets a running rebuild finish`() {
        Mockito.`when`(profileService.findBatch(userId)).thenReturn(null)

        handler.handle(event())

        Mockito.verify(profileService).finishRebuild(userId)
        Mockito.verifyNoInteractions(chatClient)
    }

    private fun prompts(method: String): List<String> =
        Mockito.mockingDetails(requestSpec).invocations.filter { it.method.name == method }.map { it.arguments[0] as String }

    private fun stubModel(vararg answers: String?) {
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.content()).thenReturn(answers.first(), *answers.drop(1).toTypedArray())
    }

    private fun note(title: String, content: String) =
        ProfileNote(UUID.randomUUID(), title, content, Instant.parse("2026-11-01T10:00:00Z"))

    private fun batch(profile: String?, vararg notes: ProfileNote, remain: Boolean = false) = ProfileBatch(
        profile = profile,
        profileVersion = profile?.let { 3L },
        notes = notes.toList(),
        through = NotesMark(notes.last().updatedAt, notes.last().id),
        remain = remain,
    )

    private fun event() = OutboxEventEntity(
        type = OutboxEventType.USER_PROFILE_REFRESH_REQUESTED,
        payload = objectMapper.writeValueAsString(UserProfileRefreshRequestedPayload(userId)),
        status = OutboxEventStatus.PROCESSING,
        attempts = 0,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )
}
