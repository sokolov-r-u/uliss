package io.uliss.featureflags

import dev.openfeature.sdk.ImmutableContext
import dev.openfeature.sdk.OpenFeatureAPI
import org.junit.jupiter.api.Test
import kotlin.test.assertFalse

class TestFeatureFlagsTest {

    @Test
    fun `reset turns off every flag a test turned on`() {
        val flags = TestFeatureFlags()
        val client = OpenFeatureAPI.createIsolated().apply { setProviderAndWait(flags.provider) }.client
        flags.enable(FeatureFlagKeys.NOTE_RESUMMARIZE)

        flags.reset()

        assertFalse(client.getBooleanValue(FeatureFlagKeys.NOTE_RESUMMARIZE, false, ImmutableContext("user")))
    }
}
