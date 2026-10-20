package io.uliss.note_service.dto.internal

/** The user's whole sky read at one moment: the constellation tree and the stars, oldest first. */
data class SkyView(
    val constellations: List<ConstellationView>,
    val notes: List<SkyNote>,
)
