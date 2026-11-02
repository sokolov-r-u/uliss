package io.uliss.note_service

import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.ProfileRebuildStatus
import io.uliss.note_service.model.ProfileRebuildTrigger
import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.model.UserProfileRebuildEntity
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.UserProfileRebuildRepository
import io.uliss.note_service.repository.UserProfileRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.sql.Timestamp
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class UserProfileRebuildApiIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var profileRepository: UserProfileRepository

    @Autowired
    lateinit var rebuildRepository: UserProfileRebuildRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()

    @Test
    fun `a rebuild is accepted, logged, queued, and the profile page shows it running with one try left`() {
        profile()

        mockMvc.post("/note/profile/rebuild") { auth() }.andExpect {
            status { isAccepted() }
            jsonPath("$.running") { value(true) }
            jsonPath("$.remaining") { value(1) }
            jsonPath("$.availableAt") { value(null) }
        }

        val rebuild = rebuilds().single()
        assertEquals(ProfileRebuildTrigger.USER, rebuild.trigger)
        assertEquals(ProfileRebuildStatus.RUNNING, rebuild.status)
        assertEquals(1, pendingRefreshEvents())
        mockMvc.get("/note/profile") { auth() }.andExpect {
            status { isOk() }
            jsonPath("$.content") { value("profile") }
            jsonPath("$.rebuild.running") { value(true) }
            jsonPath("$.rebuild.remaining") { value(1) }
        }
    }

    @Test
    fun `a third user rebuild within the window is refused until the oldest one leaves it`() {
        profile()
        val oldest = Instant.now().minus(20, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS)
        finished(ProfileRebuildTrigger.USER, oldest)
        finished(ProfileRebuildTrigger.USER, Instant.now().minus(5, ChronoUnit.DAYS))
        finished(ProfileRebuildTrigger.USER, Instant.now().minus(31, ChronoUnit.DAYS))
        finished(ProfileRebuildTrigger.DELETIONS, Instant.now().minus(1, ChronoUnit.DAYS))
        val availableAt = oldest.plus(30, ChronoUnit.DAYS).toString()

        mockMvc.post("/note/profile/rebuild") { auth() }.andExpect {
            status { isTooManyRequests() }
            jsonPath("$.code") { value("PROFILE_REBUILD_LIMIT") }
            jsonPath("$.details.availableAt") { value(availableAt) }
        }
        mockMvc.get("/note/profile") { auth() }.andExpect {
            jsonPath("$.rebuild.running") { value(false) }
            jsonPath("$.rebuild.remaining") { value(0) }
            jsonPath("$.rebuild.availableAt") { value(availableAt) }
        }
        assertEquals(4, rebuilds().size)
    }

    @Test
    fun `a rebuild while one runs is a conflict and spends no try`() {
        profile()
        rebuildRepository.saveAndFlush(UserProfileRebuildEntity(userId, ProfileRebuildTrigger.DELETIONS))

        mockMvc.post("/note/profile/rebuild") { auth() }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("PROFILE_REBUILD_RUNNING") }
        }
        mockMvc.get("/note/profile") { auth() }.andExpect { jsonPath("$.rebuild.remaining") { value(2) } }
    }

    @Test
    fun `without a profile text or a READY note there is nothing to rebuild`() {
        noteRepository.saveAndFlush(NoteEntity(userId, null, status = NoteStatus.GENERATING))

        mockMvc.post("/note/profile/rebuild") { auth() }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("PROFILE_NOTHING_TO_REBUILD") }
        }
        assertEquals(0, rebuilds().size)
    }

    @Test
    fun `a user with notes and no profile yet may rebuild, and gets a profile row for the deletion flag`() {
        noteRepository.saveAndFlush(NoteEntity(userId, "Fresh note"))

        mockMvc.post("/note/profile/rebuild") { auth() }.andExpect { status { isAccepted() } }

        assertNotNull(profileRepository.findByUserId(userId))
        assertEquals(1, rebuilds().size)
    }

    @Test
    fun `two rebuild requests at once start one rebuild`() {
        profile()
        val pool = Executors.newFixedThreadPool(2)
        val statuses = try {
            List(2) {
                pool.submit(Callable { mockMvc.post("/note/profile/rebuild") { auth() }.andReturn().response.status })
            }.map { it.get() }
        } finally {
            pool.shutdown()
        }

        assertEquals(listOf(202, 409), statuses.sorted())
        assertEquals(1, rebuilds().size)
    }

    @Test
    fun `the profile page shows the caller's own rebuild state only`() {
        profile()
        rebuildRepository.saveAndFlush(UserProfileRebuildEntity(UUID.randomUUID(), ProfileRebuildTrigger.USER))

        mockMvc.get("/note/profile") { auth() }.andExpect {
            jsonPath("$.rebuild.running") { value(false) }
            jsonPath("$.rebuild.remaining") { value(2) }
        }
    }

    @Test
    fun `a rebuild needs a token`() {
        mockMvc.post("/note/profile/rebuild").andExpect { status { isUnauthorized() } }
    }

    private fun profile() {
        profileRepository.saveAndFlush(UserProfileEntity(userId, "profile", Instant.EPOCH, UUID.randomUUID()))
    }

    private fun finished(trigger: ProfileRebuildTrigger, startedAt: Instant) {
        val rebuild = rebuildRepository.saveAndFlush(
            UserProfileRebuildEntity(userId, trigger, ProfileRebuildStatus.DONE, finishedAt = startedAt)
        )
        jdbcTemplate.update(
            "UPDATE note.user_profile_rebuild SET created_at = ? WHERE id = ?", Timestamp.from(startedAt), rebuild.id,
        )
    }

    private fun rebuilds(): List<UserProfileRebuildEntity> = rebuildRepository.findAll().filter { it.userId == userId }

    private fun pendingRefreshEvents(): Int = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM note.outbox_event WHERE status = 'PENDING' AND dedup_key = ?",
        Int::class.java,
        "USER_PROFILE_REFRESH_REQUESTED:$userId",
    )!!

    private fun MockHttpServletRequestDsl.auth() {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }
}
