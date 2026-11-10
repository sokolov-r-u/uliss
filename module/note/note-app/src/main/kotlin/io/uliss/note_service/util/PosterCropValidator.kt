package io.uliss.note_service.util

import io.uliss.note_service.dto.request.CropFrameRequest
import io.uliss.note_service.dto.request.PosterCropRequest
import io.uliss.note_service.model.payload.CropFrame
import io.uliss.note_service.model.payload.PosterCrop

/**
 * The poster's crop frames as sent by the SPA. The server does not know the image's size, so it checks only that each
 * frame is a finite, non-empty rectangle inside the image (0..1, `x + w <= 1`, `y + h <= 1`); whether the 2:3 frame and
 * the avatar's square match the image's proportions is the browser's concern.
 */
object PosterCropValidator {
    const val RULE = "poster crop needs a poster and an avatar frame of finite x, y, w, h inside 0..1, w and h above 0"

    /** Both frames; null when either is missing or not a rectangle inside the image. */
    fun validate(request: PosterCropRequest): PosterCrop? {
        val poster = request.poster?.let(::frame) ?: return null
        val avatar = request.avatar?.let(::frame) ?: return null
        return PosterCrop(poster, avatar)
    }

    private fun frame(request: CropFrameRequest): CropFrame? {
        val x = request.x ?: return null
        val y = request.y ?: return null
        val w = request.w ?: return null
        val h = request.h ?: return null
        if (!listOf(x, y, w, h).all { it.isFinite() }) return null
        val inside = x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1
        return if (inside) CropFrame(x, y, w, h) else null
    }
}
