package io.uliss.note_service.dto.request

/** A crop frame as sent; `PosterCropValidator` decides whether it is one. */
data class CropFrameRequest(
    val x: Double?,
    val y: Double?,
    val w: Double?,
    val h: Double?,
)
