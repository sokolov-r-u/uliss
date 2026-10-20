package io.uliss.auth.service

import com.jayway.jsonpath.JsonPath
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.auth.config.TestContainersConfiguration
import io.uliss.auth.repository.SigningKeyRepository
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals

/** A new signing key on every start would invalidate every issued token; replicas must agree on one key. */
@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class SigningKeysServiceTest @Autowired constructor(
    private val signingKeysService: SigningKeysService,
    private val signingKeyRepository: SigningKeyRepository,
    private val jdbcTemplate: JdbcTemplate,
    private val mockMvc: MockMvc,
) {
    @MockitoBean
    lateinit var userServiceBlockingStub: UserServiceGrpc.UserServiceBlockingStub

    @Test
    fun `the published key is the stored one and a restart keeps it`() {
        val stored = signingKeysService.getOrGenerate()

        val jwks = mockMvc.get("/oauth2/jwks").andExpect { status { isOk() } }.andReturn().response.contentAsString

        assertEquals(listOf(stored.id.toString()), JsonPath.read<List<String>>(jwks, "$.keys[*].kid"))
        assertEquals(stored.id, signingKeysService.getOrGenerate().id)
    }

    @Test
    fun `replicas starting together on an empty database create one key`() {
        // the running context publishes the current key; keep a copy of the rows to put back
        jdbcTemplate.execute("create table auth.signing_keys_backup as select * from auth.signing_keys")
        jdbcTemplate.update("delete from auth.signing_keys")
        try {
            val start = CountDownLatch(1)
            val pool = Executors.newFixedThreadPool(4)
            val calls = (1..4).map { pool.submit<String> { start.await(); signingKeysService.getOrGenerate().id.toString() } }
            start.countDown()
            val ids = calls.map { it.get(30, TimeUnit.SECONDS) }.toSet()
            pool.shutdown()

            assertEquals(1, ids.size, "every replica must use the same key")
            assertEquals(1L, signingKeyRepository.count())
        } finally {
            jdbcTemplate.update("delete from auth.signing_keys")
            jdbcTemplate.update("insert into auth.signing_keys select * from auth.signing_keys_backup")
            jdbcTemplate.execute("drop table auth.signing_keys_backup")
        }
    }
}
