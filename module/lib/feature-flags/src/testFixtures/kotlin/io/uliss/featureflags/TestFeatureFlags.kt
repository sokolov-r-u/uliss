package io.uliss.featureflags

import dev.openfeature.sdk.providers.memory.Flag
import dev.openfeature.sdk.providers.memory.InMemoryProvider

/**
 * Flags for tests: every flag is off until a test turns it on for everyone or for given users. Register [provider] as
 * a `FeatureProvider` bean to replace the flagd file.
 */
class TestFeatureFlags {

    val provider = InMemoryProvider(emptyMap())

    fun enable(key: String) {
        provider.updateFlag(key, flag { true })
    }

    fun enableFor(key: String, vararg userIds: String) {
        val targeted = userIds.toSet()
        provider.updateFlag(key, flag { targetingKey -> targetingKey in targeted })
    }

    fun reset() {
        provider.updateFlags(emptyMap())
    }

    private fun flag(isOn: (targetingKey: String?) -> Boolean): Flag<Boolean> =
        Flag.builder<Boolean>()
            .variants(mapOf(ON to true, OFF to false))
            .defaultVariant(OFF)
            .contextEvaluator { _, context -> isOn(context?.targetingKey) }
            .build()

    private companion object {
        const val ON = "on"
        const val OFF = "off"
    }
}
