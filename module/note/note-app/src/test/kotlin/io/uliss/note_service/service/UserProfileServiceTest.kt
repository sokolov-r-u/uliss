package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.model.projection.ProfileNote
import io.uliss.note_service.outbox.OutboxService
import io.uliss.note_service.repository.UserProfileNoteStore
import io.uliss.note_service.repository.UserProfileInputRepository
import io.uliss.note_service.repository.UserProfileRebuildRepository
import io.uliss.note_service.repository.UserProfileRepository
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import tools.jackson.databind.json.JsonMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class UserProfileServiceTest {

    private val profileRepository = Mockito.mock(UserProfileRepository::class.java)
    private val noteStore = Mockito.mock(UserProfileNoteStore::class.java)
    private val outboxService = Mockito.mock(OutboxService::class.java)
    private val now = Instant.parse("2026-11-02T03:00:00Z")
    private val userId = UUID.randomUUID()

    @Test
    fun `notes remain when the budget cut the fetched notes or the fetch hit its limit`() {
        val notes = List(3) { ProfileNote(UUID.randomUUID(), null, "x".repeat(10), now.minusSeconds(600)) }

        assertTrue(findBatch(notes, batchMaxChars = 25, batchMaxNotes = 10).remain, "the budget took two of three")
        assertTrue(findBatch(notes, batchMaxChars = 100, batchMaxNotes = 3).remain, "a full fetch may have more")
        assertFalse(findBatch(notes, batchMaxChars = 100, batchMaxNotes = 10).remain)
        assertEquals(2, findBatch(notes, batchMaxChars = 25, batchMaxNotes = 10).notes.size)
    }

    @Test
    fun `a halved batch still reads a long first note whole, as the full budget would`() {
        val long = ProfileNote(UUID.randomUUID(), null, "x".repeat(5_000), now.minusSeconds(600))
        Mockito.`when`(profileRepository.findByUserId(userId)).thenReturn(
            UserProfileEntity(userId, "profile", null, null).apply { batchShrink = 3 }
        )

        val batch = findBatch(listOf(long), batchMaxChars = 8_000, batchMaxNotes = 10)

        assertEquals(5_000, batch.notes.single().content.length)
    }

    private fun findBatch(notes: List<ProfileNote>, batchMaxChars: Int, batchMaxNotes: Int) =
        service(UserProfileProperties(batchMaxChars = batchMaxChars, batchMaxNotes = batchMaxNotes)).let {
            Mockito.`when`(noteStore.findNotesAfter(anyValue(), anyValue(), anyValue(), Mockito.anyInt()))
                .thenReturn(notes)
            it.findBatch(userId)!!
        }

    private fun service(properties: UserProfileProperties) = UserProfileService(
        profileRepository, Mockito.mock(UserProfileRebuildRepository::class.java),
        Mockito.mock(UserProfileInputRepository::class.java), noteStore, outboxService, JsonMapper.builder().build(),
        properties, Clock.fixed(now, ZoneOffset.UTC),
    )
}
