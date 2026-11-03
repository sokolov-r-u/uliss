package io.uliss.note_service.service

import io.uliss.note_service.NoteIntegrationTest
import io.uliss.note_service.dto.internal.ProfileRulesState
import io.uliss.note_service.dto.internal.UserBackground
import io.uliss.note_service.dto.internal.UserProfileInput
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.ProfileRebuildTrigger
import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.model.UserProfileRebuildEntity
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.UserProfileRebuildRepository
import io.uliss.note_service.repository.UserProfileRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** How the user's description and rules reach the profile writer and when the profile is brought in line with them. */
class UserProfileRulesIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var service: UserProfileService

    @Autowired
    lateinit var inputService: UserProfileInputService

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var profileRepository: UserProfileRepository

    @Autowired
    lateinit var rebuildRepository: UserProfileRebuildRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()
    private val hourAgo = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS)

    @Test
    fun `a batch carries the user's description and rules at their current version`() {
        note("Jazz", hourAgo)
        inputService.saveAbout(userId, "Designer.")
        inputService.saveRules(userId, listOf("No films."))

        val batch = service.findBatch(userId)!!

        assertEquals(UserProfileInput("Designer.", listOf("No films."), rulesVersion = 1), batch.input)
    }

    @Test
    fun `a saved batch keeps the rules version it was read with and queues another refresh when the rules moved on`() {
        note("Jazz", hourAgo)
        inputService.saveRules(userId, listOf("No films."))
        val batch = service.findBatch(userId)!!
        inputService.saveRules(userId, listOf("No films at all."))
        clearRefreshEvents()

        service.save(userId, batch, "## Interests\nJazz.")

        assertEquals(1, profileRepository.findByUserId(userId)!!.rulesVersion)
        assertEquals(1, pendingRefreshEvents())
    }

    @Test
    fun `a saved batch under the current rules clears a failed apply and queues nothing more`() {
        note("Jazz", hourAgo)
        inputService.saveRules(userId, listOf("No films."))
        profileRepository.saveAndFlush(UserProfileEntity(userId, null, null, null).apply { rulesFailedVersion = 1 })
        val batch = service.findBatch(userId)!!
        clearRefreshEvents()

        service.save(userId, batch, "## Interests\nJazz.")

        val profile = profileRepository.findByUserId(userId)!!
        assertEquals(1, profile.rulesVersion)
        assertNull(profile.rulesFailedVersion)
        assertEquals(0, pendingRefreshEvents())
    }

    @Test
    fun `a profile text behind the rules is due to be brought in line with them, and only then`() {
        assertNull(service.findRulesWork(userId)) // no profile
        profile("## Interests\nFilms.")
        assertNull(service.findRulesWork(userId)) // no rules

        inputService.saveRules(userId, listOf("No films."))

        val work = service.findRulesWork(userId)!!
        assertEquals("## Interests\nFilms.", work.profile)
        assertEquals(listOf("No films."), work.input.rules)

        rebuildRepository.saveAndFlush(UserProfileRebuildEntity(userId, ProfileRebuildTrigger.USER))
        assertNull(service.findRulesWork(userId)) // the rebuild finishes first and writes under the current rules
    }

    @Test
    fun `a profile brought in line keeps its mark, takes the rules version it was read with, and goes again if they moved on`() {
        val mark = profile("## Interests\nFilms.").notesThrough
        inputService.saveRules(userId, listOf("No films."))
        val work = service.findRulesWork(userId)!!
        inputService.saveRules(userId, listOf("No films at all."))
        clearRefreshEvents()

        service.saveConformed(userId, work, "## Interests\nMusic.")

        val saved = profileRepository.findByUserId(userId)!!
        assertEquals("## Interests\nMusic.", saved.content)
        assertEquals(mark, saved.notesThrough)
        assertEquals(1, saved.rulesVersion)
        assertEquals(1, pendingRefreshEvents())
    }

    @Test
    fun `a profile changed while it was brought in line keeps the newer text`() {
        profile("## Interests\nFilms.")
        inputService.saveRules(userId, listOf("No films."))
        val work = service.findRulesWork(userId)!!
        profileRepository.findByUserId(userId)!!.let { it.content = "newer"; profileRepository.saveAndFlush(it) }

        service.saveConformed(userId, work, "## Interests\nMusic.")

        assertEquals("newer", profileRepository.findByUserId(userId)!!.content)
    }

    @Test
    fun `a rebuild takes the rules of its last batch, and a profile behind newer rules after it goes again`() {
        note("Jazz", hourAgo)
        profile("## Interests\nFilms.")
        inputService.saveRules(userId, listOf("No films."))
        service.requestRebuild(userId)
        val batch = service.findBatch(userId)!!
        inputService.saveRules(userId, listOf("No films at all."))
        clearRefreshEvents()

        service.save(userId, batch, "## Interests\nJazz.")

        val saved = profileRepository.findByUserId(userId)!!
        assertEquals("## Interests\nJazz.", saved.content)
        assertEquals(1, saved.rulesVersion)
        assertEquals(1, pendingRefreshEvents())
        assertEquals(2, service.findRulesWork(userId)!!.input.rulesVersion)
    }

    @Test
    fun `bringing the profile in line failing for good is remembered for the rules it failed on`() {
        profile("## Interests\nFilms.")
        inputService.saveRules(userId, listOf("No films."))

        service.handleFailedBatch(userId)

        assertEquals(1, profileRepository.findByUserId(userId)!!.rulesFailedVersion)
        assertEquals(ProfileRulesState(applying = false, failed = true), service.getRulesState(userId))
    }

    @Test
    fun `the nightly run queues a refresh for a profile text behind the rules, not for one without text`() {
        profile("## Interests\nFilms.")
        inputService.saveRules(userId, listOf("No films."))
        val withoutText = UUID.randomUUID()
        profileRepository.saveAndFlush(UserProfileEntity(withoutText, null, null, null))
        inputService.saveRules(withoutText, listOf("No films."))
        jdbcTemplate.update("DELETE FROM note.outbox_event WHERE dedup_key IN (?, ?)", refreshKey(), refreshKey(withoutText))

        service.requestRefreshes()

        assertEquals(1, pendingRefreshEvents())
        assertEquals(0, pendingRefreshEvents(withoutText))
    }

    @Test
    fun `the background holds the profile text and the user's description, and is null while both are missing`() {
        assertNull(service.findBackground(userId))
        profile(null)
        assertNull(service.findBackground(userId)) // a row without text is no profile

        inputService.saveAbout(userId, "Designer.")
        assertEquals(UserBackground(null, "Designer."), service.findBackground(userId))

        profileRepository.findByUserId(userId)!!.let { it.content = "Loves jazz."; profileRepository.saveAndFlush(it) }
        assertEquals(UserBackground("Loves jazz.", "Designer."), service.findBackground(userId))
    }

    private fun profile(content: String?): UserProfileEntity =
        profileRepository.saveAndFlush(UserProfileEntity(userId, content, hourAgo, UUID.randomUUID()))

    private fun clearRefreshEvents() {
        jdbcTemplate.update("DELETE FROM note.outbox_event WHERE dedup_key = ?", refreshKey())
    }

    private fun pendingRefreshEvents(user: UUID = userId): Int = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM note.outbox_event WHERE status = 'PENDING' AND dedup_key = ?", Int::class.java,
        refreshKey(user),
    )!!

    private fun refreshKey(user: UUID = userId) = "USER_PROFILE_REFRESH_REQUESTED:$user"

    private fun note(title: String, updatedAt: Instant): UUID {
        val note = noteRepository.saveAndFlush(NoteEntity(userId, "$title text", title = title))
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(updatedAt), note.id)
        return note.id
    }
}
