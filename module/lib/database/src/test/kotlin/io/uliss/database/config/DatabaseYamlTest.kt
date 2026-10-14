package io.uliss.database.config

import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.core.io.ClassPathResource
import kotlin.test.Test
import kotlin.test.assertEquals

class DatabaseYamlTest {

    private val properties = YamlPropertySourceLoader().load("database", ClassPathResource("database.yml")).single()

    // Spring passes spring.jpa.properties.* to Hibernate verbatim; keys without "hibernate." are ignored.
    @Test
    fun `batching settings use hibernate property names`() {
        val prefix = "spring.jpa.properties.hibernate"
        assertEquals(50, properties.getProperty("$prefix.jdbc.batch_size"))
        assertEquals(true, properties.getProperty("$prefix.jdbc.batch_versioned_data"))
        assertEquals(true, properties.getProperty("$prefix.order_inserts"))
        assertEquals(true, properties.getProperty("$prefix.order_updates"))
    }
}
