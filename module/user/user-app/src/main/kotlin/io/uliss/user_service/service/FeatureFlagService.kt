package io.uliss.user_service.service

import dev.openfeature.sdk.Client
import dev.openfeature.sdk.ImmutableContext
import io.uliss.featureflags.FeatureFlagKeys
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class FeatureFlagService(private val featureFlags: Client) {

    /** Every flag the web client knows, evaluated for [userId]; a flag that cannot be evaluated is off. */
    fun getForUser(userId: UUID): Map<String, Boolean> {
        val context = ImmutableContext(userId.toString())
        return FeatureFlagKeys.ALL.associateWith { featureFlags.getBooleanValue(it, false, context) }
    }
}
