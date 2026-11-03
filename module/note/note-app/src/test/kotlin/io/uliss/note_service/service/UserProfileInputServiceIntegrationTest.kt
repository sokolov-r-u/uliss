package io.uliss.note_service.service

import io.uliss.note_service.NoteIntegrationTest
import io.uliss.note_service.repository.UserProfileInputRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals

class UserProfileInputServiceIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var service: UserProfileInputService

    @Autowired
    lateinit var inputRepository: UserProfileInputRepository

    @Autowired
    lateinit var profileService: UserProfileService

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()

    @Test
    fun `changed rules get a new version and one profile refresh, however often they are saved`() {
        service.saveRules(userId, listOf("No films."))
        service.saveRules(userId, listOf("No films.", "Short sections."))

        assertEquals(2, inputRepository.findByUserId(userId)!!.rulesVersion)
        assertEquals(1, refreshEvents("PENDING"))
    }

    @Test
    fun `the same rules again or a new description do not refresh the profile`() {
        service.saveRules(userId, listOf("No films."))
        jdbcTemplate.update("DELETE FROM note.outbox_event WHERE dedup_key = ?", "USER_PROFILE_REFRESH_REQUESTED:$userId")

        service.saveRules(userId, listOf(" No films. "))
        service.saveAbout(userId, "Designer.")

        assertEquals(1, inputRepository.findByUserId(userId)!!.rulesVersion)
        assertEquals(0, refreshEvents("PENDING"))
    }

    @Test
    fun `changed rules queue a refresh even while one runs, which may have checked the rules already`() {
        profileService.requestRefresh(userId)
        jdbcTemplate.update(
            "UPDATE note.outbox_event SET status = 'PROCESSING' WHERE dedup_key = ?",
            "USER_PROFILE_REFRESH_REQUESTED:$userId",
        )

        service.saveRules(userId, listOf("No films."))

        assertEquals(1, refreshEvents("PENDING"))
    }

    @Test
    fun `two first saves at once both land in one row`() {
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val saves = listOf(
                pool.submit { start.await(); service.saveAbout(userId, "Designer.") },
                pool.submit { start.await(); service.saveRules(userId, listOf("No films.")) },
            )
            start.countDown()
            saves.forEach { it.get(30, TimeUnit.SECONDS) }
        } finally {
            pool.shutdownNow()
        }

        val input = inputRepository.findByUserId(userId)!!
        assertEquals("Designer.", input.about)
        assertEquals(listOf("No films."), input.rules)
    }

    @Test
    fun `rules with array syntax, quotes and emoji come back as written, in order`() {
        val rules = listOf("{a,b}", "Say \"no\" to films", "back\\slash", "NULL", "Музыка 🎵", "z, then a")

        service.saveRules(userId, rules)

        assertEquals(rules, service.getInput(userId).rules)
    }

    private fun refreshEvents(status: String): Int = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM note.outbox_event WHERE status = ? AND dedup_key = ?",
        Int::class.java,
        status,
        "USER_PROFILE_REFRESH_REQUESTED:$userId",
    )!!
}
