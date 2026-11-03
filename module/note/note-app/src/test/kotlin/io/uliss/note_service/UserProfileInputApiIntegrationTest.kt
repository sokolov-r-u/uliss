package io.uliss.note_service

import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.repository.UserProfileRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import java.time.Instant
import java.util.UUID

class UserProfileInputApiIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var profileRepository: UserProfileRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()

    @Test
    fun `the user's own description is saved trimmed and read back with the profile`() {
        mockMvc.put("/note/profile/about") {
            auth()
            json("""{"about": "  Designer in Lisbon.  "}""")
        }.andExpect {
            status { isOk() }
            jsonPath("$.about") { value("Designer in Lisbon.") }
        }

        mockMvc.get("/note/profile") { auth() }.andExpect {
            jsonPath("$.about") { value("Designer in Lisbon.") }
            jsonPath("$.rules") { isEmpty() }
        }
    }

    @Test
    fun `the rules are saved trimmed in their order`() {
        mockMvc.put("/note/profile/rules") {
            auth()
            json("""{"rules": [" No films. ", "Short sections."]}""")
        }.andExpect {
            status { isOk() }
            jsonPath("$.rules[0]") { value("No films.") }
            jsonPath("$.rules[1]") { value("Short sections.") }
        }
    }

    @Test
    fun `rules and a description over the limits are refused and change nothing`() {
        mockMvc.put("/note/profile/rules") { auth(); json("""{"rules": ["Kept."]}""") }
        mockMvc.put("/note/profile/about") { auth(); json("""{"about": "Kept."}""") }
        val tooMany = (1..21).joinToString(",") { "\"Rule $it\"" }
        val refused = listOf(
            "/note/profile/rules" to """{"rules": [$tooMany]}""",
            "/note/profile/rules" to """{"rules": ["Fine.", "   "]}""",
            "/note/profile/rules" to """{"rules": ["${"a".repeat(301)}"]}""",
            "/note/profile/about" to """{"about": "${"a".repeat(2_001)}"}""",
        )

        refused.forEach { (path, body) ->
            mockMvc.put(path) { auth(); json(body) }.andExpect { status { isBadRequest() } }
        }

        mockMvc.get("/note/profile") { auth() }.andExpect {
            jsonPath("$.rules.length()") { value(1) }
            jsonPath("$.rules[0]") { value("Kept.") }
            jsonPath("$.about") { value("Kept.") }
        }
    }

    @Test
    fun `the limits themselves are accepted`() {
        val twenty = (1..20).joinToString(",") { "\"${"a".repeat(300)}\"" }
        mockMvc.put("/note/profile/rules") { auth(); json("""{"rules": [$twenty]}""") }
            .andExpect { status { isOk() } }
        mockMvc.put("/note/profile/about") { auth(); json("""{"about": "${"a".repeat(2_000)}"}""") }
            .andExpect { status { isOk() } }
    }

    @Test
    fun `the description and rules need a token and are the caller's own`() {
        mockMvc.put("/note/profile/about") { json("""{"about": "x"}""") }.andExpect { status { isUnauthorized() } }
        mockMvc.put("/note/profile/rules") { json("""{"rules": []}""") }.andExpect { status { isUnauthorized() } }
        mockMvc.put("/note/profile/about") { auth(UUID.randomUUID()); json("""{"about": "Someone else."}""") }

        mockMvc.get("/note/profile") { auth() }.andExpect { jsonPath("$.about") { value(null) } }
    }

    @Test
    fun `a profile behind the rules is applying them until applying them fails for good`() {
        mockMvc.put("/note/profile/rules") { auth(); json("""{"rules": ["No films."]}""") }.andExpect {
            jsonPath("$.applyingRules") { value(false) } // no profile text yet: nothing to apply them to
        }
        profileRepository.saveAndFlush(UserProfileEntity(userId, "## Interests\nFilms.", Instant.EPOCH, UUID.randomUUID()))

        mockMvc.get("/note/profile") { auth() }.andExpect {
            jsonPath("$.applyingRules") { value(true) }
            jsonPath("$.rulesFailed") { value(false) }
        }

        jdbcTemplate.update("UPDATE note.user_profile SET rules_failed_version = 1 WHERE user_id = ?", userId)
        mockMvc.get("/note/profile") { auth() }.andExpect {
            jsonPath("$.applyingRules") { value(false) }
            jsonPath("$.rulesFailed") { value(true) }
        }

        // a newer version of the rules is a new try
        mockMvc.put("/note/profile/rules") { auth(); json("""{"rules": ["No films at all."]}""") }.andExpect {
            jsonPath("$.applyingRules") { value(true) }
            jsonPath("$.rulesFailed") { value(false) }
        }

        jdbcTemplate.update("UPDATE note.user_profile SET rules_version = 2 WHERE user_id = ?", userId)
        mockMvc.get("/note/profile") { auth() }.andExpect { jsonPath("$.applyingRules") { value(false) } }
    }

    private fun MockHttpServletRequestDsl.json(body: String) {
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun MockHttpServletRequestDsl.auth(user: UUID = userId) {
        with(jwt().jwt { it.claim("userId", user.toString()) })
    }
}
