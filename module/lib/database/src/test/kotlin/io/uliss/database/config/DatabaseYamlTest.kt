package io.uliss.database.config

import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.core.io.ClassPathResource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class DatabaseYamlTest {

    private fun load(file: String) = YamlPropertySourceLoader().load(file, ClassPathResource(file)).single()

    // Spring passes spring.jpa.properties.* to Hibernate verbatim; keys without "hibernate." are ignored.
    // The test config must batch like production, or integration tests run a different write path.
    @Test
    fun `batching settings use hibernate property names`() {
        listOf("database.yml", "database-test.yml").forEach { file ->
            val properties = load(file)
            val prefix = "spring.jpa.properties.hibernate"
            assertEquals(50, properties.getProperty("$prefix.jdbc.batch_size"), file)
            assertEquals(true, properties.getProperty("$prefix.jdbc.batch_versioned_data"), file)
            assertEquals(true, properties.getProperty("$prefix.order_inserts"), file)
            assertEquals(true, properties.getProperty("$prefix.order_updates"), file)
        }
    }

    // Hikari waits 30 s for a connection by default: under load a request would hang that long before failing.
    @Test
    fun `a request fails fast when the pool is exhausted`() {
        assertNotNull(load("database.yml").getProperty("spring.datasource.hikari.connection-timeout"))
    }
}
