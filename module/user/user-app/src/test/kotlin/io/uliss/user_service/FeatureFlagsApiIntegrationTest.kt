package io.uliss.user_service

import dev.openfeature.sdk.FeatureProvider
import io.uliss.featureflags.FeatureFlagKeys
import io.uliss.featureflags.TestFeatureFlags
import io.uliss.user_service.config.TestContainersConfiguration
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class, FeatureFlagsApiIntegrationTest.Flags::class)
class FeatureFlagsApiIntegrationTest @Autowired constructor(
    private val mockMvc: MockMvc,
    private val flags: TestFeatureFlags,
) {

    @TestConfiguration(proxyBeanMethods = false)
    class Flags {
        @Bean
        fun testFeatureFlags() = TestFeatureFlags()

        @Bean
        fun featureProvider(flags: TestFeatureFlags): FeatureProvider = flags.provider
    }

    @AfterEach
    fun resetFlags() = flags.reset()

    @Test
    fun `a targeted user sees the flag on`() {
        val userId = UUID.randomUUID()
        flags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, userId.toString())

        mockMvc.get("/user/users/me/features") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$['note-resummarize']") { value(true) }
        }
    }

    @Test
    fun `another user sees every flag off`() {
        flags.enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, UUID.randomUUID().toString())

        mockMvc.get("/user/users/me/features") {
            with(jwt().jwt { it.claim("userId", UUID.randomUUID().toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$['note-resummarize']") { value(false) }
        }
    }

    @Test
    fun `features need a token`() {
        mockMvc.get("/user/users/me/features").andExpect {
            status { isUnauthorized() }
        }
    }
}
