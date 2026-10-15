package io.uliss.logging.config

import io.uliss.logging.logger.AppLogger
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.boot.WebApplicationType
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.boot.test.system.CapturedOutput
import org.springframework.boot.test.system.OutputCaptureExtension
import org.springframework.context.annotation.Configuration
import kotlin.test.assertContains
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@Configuration(proxyBeanMethods = false)
class EmptyConfig

@ExtendWith(OutputCaptureExtension::class)
class ConsoleLogPatternTest {

    private val log = AppLogger.of(ConsoleLogPatternTest::class)

    private fun runApp(vararg properties: String, block: () -> Unit) {
        SpringApplicationBuilder(EmptyConfig::class.java)
            .web(WebApplicationType.NONE)
            .properties("spring.main.banner-mode=off", "spring.output.ansi.enabled=never", *properties)
            .run()
            .use { block() }
    }

    @Test
    fun `text console output appends key values after the message`(output: CapturedOutput) {
        runApp { log.info("probe {}", "check", 1) }

        val line = output.lines().single { "probe 1" in it }
        val expected = Regex(
            """^\d{4}-\d{2}-\d{2}T\S+ +INFO \d+ --- .*\[.+] i\.u\.l\.config\.ConsoleLogPatternTest +: probe 1 method="check"$""",
        )
        assertTrue(expected.matches(line), line)
    }

    @Test
    fun `text console output has no trailing space without key values`(output: CapturedOutput) {
        runApp { org.slf4j.LoggerFactory.getLogger(ConsoleLogPatternTest::class.java).info("plain probe") }

        assertTrue(output.lines().any { it.endsWith(": plain probe") }, output.toString())
    }

    @Test
    fun `application can override the console pattern`(output: CapturedOutput) {
        runApp("logging.pattern.console=custom %m%n") { log.info("probe", "check") }

        assertContains(output.lines(), "custom probe")
        assertFalse(output.lines().any { "method=" in it }, output.toString())
    }
}
