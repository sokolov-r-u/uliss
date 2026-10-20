package io.uliss.user_service.onboarding

import io.uliss.exception.common.BadRequestException
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.model.UserMessageStatus
import org.springframework.stereotype.Component
import java.text.Normalizer

@Component
class SetDisplayNameCommand : OnboardingCommand {

    override val code = OnboardingMessageCode.SET_DISPLAY_NAME

    /**
     * The name reaches the token, the UI and model prompts: control, format (bidi overrides, zero-width) and other
     * invisible characters would let one name pose as another. Stored in NFC, so equal-looking names are equal.
     */
    override fun apply(user: UserEntity, input: OnboardingInput): UserMessageStatus {
        val displayName = input.displayName?.let { Normalizer.normalize(it, Normalizer.Form.NFC) }?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: throw BadRequestException("displayName is required")
        if (INVISIBLE.containsMatchIn(displayName)) {
            throw BadRequestException("displayName contains invisible or control characters")
        }
        user.displayName = displayName
        return UserMessageStatus.COMPLETED
    }

    private companion object {
        val INVISIBLE = Regex("\\p{C}")
    }
}
