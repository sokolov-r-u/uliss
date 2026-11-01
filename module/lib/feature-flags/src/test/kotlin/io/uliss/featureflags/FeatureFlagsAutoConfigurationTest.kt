package io.uliss.featureflags

import dev.openfeature.sdk.Client
import dev.openfeature.sdk.FeatureProvider
import dev.openfeature.sdk.ImmutableContext
import dev.openfeature.sdk.OpenFeatureAPI
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.boot.autoconfigure.AutoConfigurations
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.awaitility.Awaitility.await
import java.nio.file.Path
import java.nio.file.attribute.FileTime
import java.time.Duration
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.io.path.getLastModifiedTime
import kotlin.io.path.setLastModifiedTime
import kotlin.io.path.writeText
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FeatureFlagsAutoConfigurationTest {

    @TempDir
    lateinit var dir: Path

    private val runner = ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(FeatureFlagsAutoConfiguration::class.java))

    @Test
    fun `flag enabled for everyone is on for any user`() {
        val file = dir.resolve("flags.json").apply { writeText(flags(defaultVariant = "on")) }

        runner.withPropertyValues("uliss.feature-flags.file=$file").run { context ->
            assertTrue(context.getBean(Client::class.java).isOn(USER))
        }
    }

    @Test
    fun `targeting turns the flag on only for the listed users`() {
        val file = dir.resolve("flags.json").apply { writeText(flags(defaultVariant = "off", targeting = forUser(USER))) }

        runner.withPropertyValues("uliss.feature-flags.file=$file").run { context ->
            val client = context.getBean(Client::class.java)
            assertTrue(client.isOn(USER))
            assertFalse(client.isOn(OTHER_USER))
        }
    }

    @Test
    fun `disabled flag is off even for a targeted user`() {
        val file = dir.resolve("flags.json")
            .apply { writeText(flags(defaultVariant = "on", state = "DISABLED", targeting = forUser(USER))) }

        runner.withPropertyValues("uliss.feature-flags.file=$file").run { context ->
            assertFalse(context.getBean(Client::class.java).isOn(USER))
        }
    }

    @Test
    fun `every flag is off when no file is configured`() {
        runner.run { context ->
            assertFalse(context.getBean(Client::class.java).isOn(USER))
        }
    }

    @Test
    fun `every flag is off when the configured file does not exist`() {
        runner.withPropertyValues("uliss.feature-flags.file=${dir.resolve("absent.json")}").run { context ->
            assertFalse(context.getBean(Client::class.java).isOn(USER))
        }
    }

    @Test
    fun `every flag is off when the file is invalid at startup`() {
        val file = dir.resolve("flags.json").apply { writeText("{ not json") }

        runner.withPropertyValues("uliss.feature-flags.file=$file").run { context ->
            assertFalse(context.getBean(Client::class.java).isOn(USER))
        }
    }

    @Test
    fun `a changed file is applied without a restart`() {
        val file = dir.resolve("flags.json").apply { writeText(flags(defaultVariant = "off")) }

        fastPolling(file).run { context ->
            val client = context.getBean(Client::class.java)
            assertFalse(client.isOn(USER))

            file.rewrite(flags(defaultVariant = "on"))

            await().atMost(Duration.ofSeconds(5)).untilAsserted { assertTrue(client.isOn(USER)) }
        }
    }

    @Test
    fun `a file broken at runtime keeps the last valid values`() {
        val file = dir.resolve("flags.json").apply { writeText(flags(defaultVariant = "on")) }

        fastPolling(file).run { context ->
            val stale = AtomicBoolean()
            context.getBean(OpenFeatureAPI::class.java).onProviderStale { stale.set(true) }

            file.rewrite("{ not json")

            await().atMost(Duration.ofSeconds(5)).untilTrue(stale)
            assertTrue(context.getBean(Client::class.java).isOn(USER))
        }
    }

    @Test
    fun `a file invalid at startup is applied once fixed`() {
        val file = dir.resolve("flags.json").apply { writeText("{ not json") }

        fastPolling(file).run { context ->
            file.rewrite(flags(defaultVariant = "on"))

            val client = context.getBean(Client::class.java)
            await().atMost(Duration.ofSeconds(5)).untilAsserted { assertTrue(client.isOn(USER)) }
        }
    }

    @Test
    fun `a provider bean of the application replaces the file`() {
        val file = dir.resolve("flags.json").apply { writeText(flags(defaultVariant = "on")) }
        val testFlags = TestFeatureFlags().apply { enableFor(FeatureFlagKeys.NOTE_RESUMMARIZE, OTHER_USER) }

        runner.withPropertyValues("uliss.feature-flags.file=$file")
            .withBean(FeatureProvider::class.java, { testFlags.provider })
            .run { context ->
                val client = context.getBean(Client::class.java)
                assertFalse(client.isOn(USER))
                assertTrue(client.isOn(OTHER_USER))
            }
    }

    private fun fastPolling(file: Path) =
        runner.withPropertyValues("uliss.feature-flags.file=$file", "uliss.feature-flags.poll-interval=50ms")

    // the provider polls the modification time, so every rewrite moves it forward explicitly
    private fun Path.rewrite(content: String) {
        val previous = getLastModifiedTime()
        writeText(content)
        setLastModifiedTime(FileTime.fromMillis(previous.toMillis() + 1_000))
    }

    private fun forUser(userId: String) = """{ "if": [{ "in": [{ "var": "targetingKey" }, ["$userId"]] }, "on", "off"] }"""

    private fun Client.isOn(userId: String): Boolean =
        getBooleanValue(FeatureFlagKeys.NOTE_RESUMMARIZE, false, ImmutableContext(userId))

    private fun flags(defaultVariant: String, state: String = "ENABLED", targeting: String? = null): String = """
        {
          "${'$'}schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "${FeatureFlagKeys.NOTE_RESUMMARIZE}": {
              "state": "$state",
              "variants": { "on": true, "off": false },
              "defaultVariant": "$defaultVariant"${targeting?.let { ",\n\"targeting\": $it" } ?: ""}
            }
          }
        }
    """.trimIndent()

    private companion object {
        const val USER = "9a1c0b7e-0000-4000-8000-000000000001"
        const val OTHER_USER = "9a1c0b7e-0000-4000-8000-000000000002"
    }
}
