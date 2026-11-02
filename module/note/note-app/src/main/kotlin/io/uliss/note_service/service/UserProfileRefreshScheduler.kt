package io.uliss.note_service.service

import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/** Queues the nightly profile refreshes; the outbox handler then calls the model, one batch per event. */
@Component
class UserProfileRefreshScheduler(private val profileService: UserProfileService) {

    @Scheduled(cron = $$"${note.profile.refresh-cron}", zone = "UTC")
    fun queueRefreshes() = profileService.requestRefreshes()
}
