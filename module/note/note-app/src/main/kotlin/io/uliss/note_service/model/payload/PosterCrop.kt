package io.uliss.note_service.model.payload

/** Where the note panel's 2:3 frame and the sky avatar's circle sit on the poster image (`note_posters.crop`). */
data class PosterCrop(
    val poster: CropFrame,
    val avatar: CropFrame,
)
