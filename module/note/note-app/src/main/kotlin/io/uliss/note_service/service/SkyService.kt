package io.uliss.note_service.service

import io.uliss.note_service.dto.internal.SkyView
import io.uliss.note_service.repository.SkyStore
import io.uliss.note_service.util.SkyNotes
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/** The user's sky: the constellation tree and the stars, read in one snapshot so they never disagree. */
@Service
class SkyService(
    private val constellationService: ConstellationService,
    private val skyStore: SkyStore,
) {

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun getSky(userId: UUID): SkyView = SkyView(
        constellations = constellationService.getTree(userId),
        notes = SkyNotes.stars(skyStore.findNotes(userId), skyStore.findMemberships(userId)),
    )
}
