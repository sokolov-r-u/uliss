package io.uliss.note_service.service

import io.uliss.note_service.dto.internal.UserProfileInput
import io.uliss.note_service.model.UserProfileInputEntity
import io.uliss.note_service.repository.UserProfileInputRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/** Keeps what the user tells the profile themselves: their own description and the rules for the profile. */
@Service
class UserProfileInputService(
    private val inputRepository: UserProfileInputRepository,
    private val profileService: UserProfileService,
) {

    /** The user's description and rules; empty until they save either. */
    @Transactional(readOnly = true)
    fun getInput(userId: UUID): UserProfileInput =
        inputRepository.findByUserId(userId)?.toInput() ?: UserProfileInput(null, emptyList())

    /** Saves the user's description trimmed, a blank one as none; the profile is not rewritten for it. */
    @Transactional
    fun saveAbout(userId: UUID, about: String?): UserProfileInput {
        val input = lockedInput(userId)
        input.about = about?.trim()?.takeIf { it.isNotEmpty() }
        return input.toInput()
    }

    /**
     * Saves the user's rules trimmed, in their order. Changed rules get a new version and the profile is refreshed at
     * once, so it follows them; also beside a running refresh, which may have checked the rules already (a parallel run
     * only costs a model call: the version checks keep one result).
     */
    @Transactional
    fun saveRules(userId: UUID, rules: List<String>): UserProfileInput {
        val input = lockedInput(userId)
        val trimmed = rules.map(String::trim)
        if (trimmed != input.rules) {
            input.rules = trimmed
            input.rulesVersion++
            profileService.requestRefresh(userId)
        }
        return input.toInput()
    }

    private fun lockedInput(userId: UUID): UserProfileInputEntity {
        inputRepository.lockUserInput(userId)
        return inputRepository.findByUserId(userId) ?: inputRepository.save(UserProfileInputEntity(userId))
    }

    private fun UserProfileInputEntity.toInput() = UserProfileInput(about, rules, rulesVersion)
}
