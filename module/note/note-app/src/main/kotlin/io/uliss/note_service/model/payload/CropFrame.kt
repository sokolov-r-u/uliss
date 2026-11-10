package io.uliss.note_service.model.payload

/**
 * A rectangle on a poster image in fractions of its width ([x], [w]) and height ([y], [h]), 0..1, so it holds for any
 * resolution of the same image. A round avatar is stored as the square around its circle.
 */
data class CropFrame(
    val x: Double,
    val y: Double,
    val w: Double,
    val h: Double,
)
