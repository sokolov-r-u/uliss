package io.uliss.note_service.util

import io.uliss.note_service.repository.ConstellationRepository
import java.util.UUID

/** The user's constellation tree without note counts. */
fun ConstellationRepository.loadTree(userId: UUID): ConstellationTree =
    ConstellationTree(findByUserIdOrderByCreatedAtAscIdAsc(userId))
