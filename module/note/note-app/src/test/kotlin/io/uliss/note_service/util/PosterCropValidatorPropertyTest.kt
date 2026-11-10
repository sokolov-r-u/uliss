package io.uliss.note_service.util

import io.uliss.note_service.dto.request.CropFrameRequest
import io.uliss.note_service.dto.request.PosterCropRequest
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.constraints.DoubleRange
import kotlin.test.assertEquals

class PosterCropValidatorPropertyTest {

    @Property(tries = 500)
    fun `a frame is accepted exactly when it lies inside the image and is not empty`(
        @ForAll @DoubleRange(min = -0.5, max = 1.5) x: Double,
        @ForAll @DoubleRange(min = -0.5, max = 1.5) y: Double,
        @ForAll @DoubleRange(min = -0.5, max = 1.5) w: Double,
        @ForAll @DoubleRange(min = -0.5, max = 1.5) h: Double,
    ) {
        val frame = CropFrameRequest(x, y, w, h)
        val inside = x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1
        val fine = CropFrameRequest(0.0, 0.0, 1.0, 1.0)

        assertEquals(inside, PosterCropValidator.validate(PosterCropRequest(frame, fine)) != null, "poster $frame")
        assertEquals(inside, PosterCropValidator.validate(PosterCropRequest(fine, frame)) != null, "avatar $frame")
    }
}
