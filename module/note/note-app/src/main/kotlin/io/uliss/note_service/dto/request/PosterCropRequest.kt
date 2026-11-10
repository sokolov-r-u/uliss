package io.uliss.note_service.dto.request

/** The poster's two crop frames as sent; `PosterCropValidator` decides whether they are valid. */
data class PosterCropRequest(
    val poster: CropFrameRequest?,
    val avatar: CropFrameRequest?,
)
