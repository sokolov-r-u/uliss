package io.uliss.user_service.service

import io.uliss.exception.common.ServerException
import io.uliss.user_service.config.TestContainersConfiguration
import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.model.Gender
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.repository.UserRepository
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpStatus
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class OnboardingSubmitIntegrationTest @Autowired constructor(
    private val userProfileService: UserProfileService,
    private val messageService: MessageService,
    private val userRepository: UserRepository,
) {

    @Test
    fun `pending steps come from the database blocking first with every field`() {
        val user = userProfileService.getOrCreate(UUID.randomUUID())

        val pending = messageService.getPending(user.id)

        assertEquals(listOf("SET_DISPLAY_NAME", "COMPLETE_PROFILE"), pending.map { it.code })
        assertEquals(listOf(true, false), pending.map { it.blocking })
        assertEquals(listOf("PENDING", "PENDING"), pending.map { it.status })
    }

    @Test
    fun `a submitted step leaves the pending list`() {
        val user = userProfileService.getOrCreate(UUID.randomUUID())

        userProfileService.submit(user.id, request(OnboardingMessageCode.SET_DISPLAY_NAME, displayName = "Ann"))

        assertEquals(listOf("COMPLETE_PROFILE"), messageService.getPending(user.id).map { it.code })
    }

    @Test
    fun `a step that is no longer pending is refused with 409`() {
        val user = userProfileService.getOrCreate(UUID.randomUUID())
        userProfileService.submit(user.id, request(OnboardingMessageCode.COMPLETE_PROFILE))

        val ex = assertFailsWith<ServerException> {
            userProfileService.submit(
                user.id,
                request(OnboardingMessageCode.COMPLETE_PROFILE, birthDate = LocalDate.of(1990, 1, 1), gender = Gender.OTHER),
            )
        }

        assertEquals(HttpStatus.CONFLICT, ex.httpStatus)
        // the skipped step did not turn into a profile edit
        assertNull(userRepository.findById(user.id).orElseThrow().birthDate)
    }

    @Test
    fun `a double submit applies once and refuses the second with 409`() {
        val user = userProfileService.getOrCreate(UUID.randomUUID())
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val calls = listOf("Ann", "Bob").map { name ->
                pool.submit {
                    start.await()
                    userProfileService.submit(user.id, request(OnboardingMessageCode.SET_DISPLAY_NAME, displayName = name))
                }
            }
            start.countDown()

            val failures = calls.mapNotNull { call ->
                try {
                    call.get(30, TimeUnit.SECONDS)
                    null
                } catch (ex: ExecutionException) {
                    ex.cause
                }
            }

            assertEquals(1, failures.size, "failures=$failures")
            assertEquals(HttpStatus.CONFLICT, (failures.single() as ServerException).httpStatus)
        } finally {
            pool.shutdownNow()
        }
    }

    private fun request(
        command: OnboardingMessageCode,
        displayName: String? = null,
        birthDate: LocalDate? = null,
        gender: Gender? = null,
    ) = OnboardingRequest(command = command, displayName = displayName, birthDate = birthDate, gender = gender)
}
