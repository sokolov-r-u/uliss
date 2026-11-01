package io.uliss.featureflags

import dev.openfeature.contrib.providers.flagd.Config
import dev.openfeature.contrib.providers.flagd.FlagdOptions
import dev.openfeature.contrib.providers.flagd.FlagdProvider
import dev.openfeature.sdk.Client
import dev.openfeature.sdk.FeatureProvider
import dev.openfeature.sdk.NoOpProvider
import dev.openfeature.sdk.OpenFeatureAPI
import dev.openfeature.sdk.exceptions.OpenFeatureError
import io.uliss.featureflags.config.FeatureFlagsProperties
import io.uliss.logging.logger.AppLogger
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import kotlin.io.path.Path
import kotlin.io.path.isRegularFile

@AutoConfiguration
@EnableConfigurationProperties(FeatureFlagsProperties::class)
class FeatureFlagsAutoConfiguration {

    private val log = AppLogger.of(FeatureFlagsAutoConfiguration::class)

    // NoOpProvider answers every flag with the caller's default, which is always "off" here. No destroy method: the
    // OpenFeature API below shuts its provider down.
    @Bean(destroyMethod = "")
    @ConditionalOnMissingBean
    fun featureFlagProvider(properties: FeatureFlagsProperties): FeatureProvider {
        val file = properties.file?.takeIf { it.isNotBlank() }
        if (file == null || !Path(file).isRegularFile()) {
            log.warn("Feature flag file {} not found, every flag is off", "featureFlagProvider", file)
            return NoOpProvider()
        }
        return FlagdProvider(
            FlagdOptions.builder()
                .resolverType(Config.Resolver.FILE)
                .offlineFlagSourcePath(file)
                .offlinePollIntervalMs(properties.pollInterval.toMillis().toInt())
                .build(),
        )
    }

    // Isolated, not the global singleton: each Spring context owns its provider. A file invalid at startup leaves the
    // provider in error, so every flag answers its default (off) until the file is fixed.
    @Bean(destroyMethod = "shutdown")
    fun openFeatureApi(provider: FeatureProvider): OpenFeatureAPI {
        val api = OpenFeatureAPI.createIsolated()
        try {
            api.setProviderAndWait(provider)
        } catch (e: OpenFeatureError) {
            log.warn("Feature flag provider failed to start, every flag is off", "openFeatureApi", e)
        }
        return api
    }

    @Bean
    fun featureFlagClient(api: OpenFeatureAPI): Client = api.client
}
