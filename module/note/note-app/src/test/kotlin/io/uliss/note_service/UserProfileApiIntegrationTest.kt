package io.uliss.note_service

import io.uliss.note_service.model.UserProfileEntity
import io.uliss.note_service.repository.UserProfileRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.time.Instant
import java.util.UUID

class UserProfileApiIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var profileRepository: UserProfileRepository

    private val userId = UUID.randomUUID()

    @Test
    fun `the profile endpoint returns the caller's own profile and when it was written`() {
        profileRepository.saveAndFlush(UserProfileEntity(userId, "## Interests\nJazz.", Instant.EPOCH, UUID.randomUUID()))
        profileRepository.saveAndFlush(UserProfileEntity(UUID.randomUUID(), "foreign", Instant.EPOCH, UUID.randomUUID()))

        mockMvc.get("/note/profile") { auth() }.andExpect {
            status { isOk() }
            jsonPath("$.content") { value("## Interests\nJazz.") }
            jsonPath("$.updatedAt") { exists() }
        }
    }

    @Test
    fun `before the first refresh the profile is empty, not missing`() {
        mockMvc.get("/note/profile") { auth() }.andExpect {
            status { isOk() }
            jsonPath("$.content") { value(null) }
            jsonPath("$.updatedAt") { value(null) }
        }
    }

    @Test
    fun `the profile needs a token`() {
        mockMvc.get("/note/profile").andExpect { status { isUnauthorized() } }
    }

    private fun MockHttpServletRequestDsl.auth() {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }
}
