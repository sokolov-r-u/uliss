package io.uliss.note_service.config

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName

/** One container per test JVM: every cached context connects to it instead of starting its own. */
@TestConfiguration(proxyBeanMethods = false)
class TestContainersConfiguration {
    // destroyMethod = "": a closing context must not stop the container other cached contexts still use
    @Bean(destroyMethod = "")
    @ServiceConnection
    fun postgresContainer(): PostgreSQLContainer = POSTGRES

    private companion object {
        // 0.8.2-pg18-trixie pinned by digest: the tag is rebuilt for new 18.x releases, which changes SCHEMA.md
        val POSTGRES: PostgreSQLContainer = PostgreSQLContainer(
            DockerImageName.parse(
                "pgvector/pgvector@sha256:b7337db8fe39d12fe8ecb0003c72680f24479813a744b43154eee6f2eab5a5f3",
            ).asCompatibleSubstituteFor("postgres")
        ).apply { withUrlParam("currentSchema", "note") }
    }
}
