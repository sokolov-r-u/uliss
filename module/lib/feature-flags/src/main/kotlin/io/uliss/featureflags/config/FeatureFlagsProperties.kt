package io.uliss.featureflags.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

/** [file] is a flagd flag definition; unset or missing means every flag is off. */
@ConfigurationProperties("uliss.feature-flags")
data class FeatureFlagsProperties(
    val file: String? = null,
    val pollInterval: Duration = Duration.ofSeconds(5),
)
