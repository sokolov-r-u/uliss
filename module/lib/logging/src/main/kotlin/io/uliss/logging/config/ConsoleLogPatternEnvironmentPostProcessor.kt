package io.uliss.logging.config

import org.springframework.boot.EnvironmentPostProcessor
import org.springframework.boot.SpringApplication
import org.springframework.core.env.ConfigurableEnvironment
import org.springframework.core.env.MapPropertySource

/**
 * Default text console pattern: Spring Boot's own plus `%kvp`, so `AppLogger`/aspect key values (`method`, ...)
 * stay visible outside structured logging. Added last, so any `logging.pattern.console` in the application wins.
 */
class ConsoleLogPatternEnvironmentPostProcessor : EnvironmentPostProcessor {

    override fun postProcessEnvironment(environment: ConfigurableEnvironment, application: SpringApplication) {
        environment.propertySources.addLast(MapPropertySource(SOURCE_NAME, mapOf(PROPERTY to PATTERN)))
    }

    private companion object {
        const val SOURCE_NAME = "ulissConsoleLogPattern"
        const val PROPERTY = "logging.pattern.console"

        // Spring Boot 4.1 defaults.xml CONSOLE_LOG_PATTERN with defaults inlined. Spring resolves the placeholders,
        // so defaults use its `${X:}` syntax (Logback's `:-` would leave a stray "-"). `%replace` drops the separator
        // space when an event has no key values.
        const val PATTERN = "%clr(%d{yyyy-MM-dd'T'HH:mm:ss.SSSXXX}){faint} %clr(%5p){} %clr(\${PID:}){magenta} " +
                "%clr(--- %esb(){APPLICATION_NAME}%esb{APPLICATION_GROUP}[%15.15t] \${LOG_CORRELATION_PATTERN:}){faint}" +
                "%clr(%-40.40logger{39}){cyan} %clr(:){faint} %m%replace( %kvp){'^ \$', ''}%n%wEx"
    }
}
