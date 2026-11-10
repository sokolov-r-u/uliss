package io.uliss.note_service.util

import io.uliss.note_service.dto.request.CropFrameRequest
import io.uliss.note_service.dto.request.PosterCropRequest
import io.uliss.note_service.model.payload.CropFrame
import io.uliss.note_service.model.payload.PosterCrop
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PosterCropValidatorTest {

    @Test
    fun `frames inside the image are accepted as they are`() {
        val request = PosterCropRequest(
            poster = CropFrameRequest(0.0, 0.1, 1.0, 0.75),
            avatar = CropFrameRequest(0.25, 0.3, 0.5, 0.3333),
        )

        assertEquals(
            PosterCrop(poster = CropFrame(0.0, 0.1, 1.0, 0.75), avatar = CropFrame(0.25, 0.3, 0.5, 0.3333)),
            PosterCropValidator.validate(request),
        )
    }

    @Test
    fun `a frame touching the right and bottom edges is accepted`() {
        val edge = CropFrameRequest(0.4, 0.7, 0.6, 0.3)

        assertEquals(CropFrame(0.4, 0.7, 0.6, 0.3), PosterCropValidator.validate(PosterCropRequest(edge, edge))?.poster)
    }

    @ParameterizedTest
    @MethodSource("refusedFrames")
    fun `a frame outside the image, empty or not finite is refused`(frame: CropFrameRequest) {
        val fine = CropFrameRequest(0.0, 0.0, 0.5, 0.5)

        assertNull(PosterCropValidator.validate(PosterCropRequest(frame, fine)), "poster $frame accepted")
        assertNull(PosterCropValidator.validate(PosterCropRequest(fine, frame)), "avatar $frame accepted")
    }

    @Test
    fun `a crop without one of its frames is refused`() {
        val fine = CropFrameRequest(0.0, 0.0, 0.5, 0.5)

        assertNull(PosterCropValidator.validate(PosterCropRequest(poster = null, avatar = fine)))
        assertNull(PosterCropValidator.validate(PosterCropRequest(poster = fine, avatar = null)))
    }

    companion object {
        @JvmStatic
        fun refusedFrames() = listOf(
            CropFrameRequest(null, 0.0, 0.5, 0.5),
            CropFrameRequest(0.0, null, 0.5, 0.5),
            CropFrameRequest(0.0, 0.0, null, 0.5),
            CropFrameRequest(0.0, 0.0, 0.5, null),
            CropFrameRequest(-0.01, 0.0, 0.5, 0.5),
            CropFrameRequest(0.0, -0.01, 0.5, 0.5),
            CropFrameRequest(0.0, 0.0, 0.0, 0.5),
            CropFrameRequest(0.0, 0.0, 0.5, 0.0),
            CropFrameRequest(0.0, 0.0, -0.5, 0.5),
            CropFrameRequest(0.6, 0.0, 0.5, 0.5),
            CropFrameRequest(0.0, 0.6, 0.5, 0.5),
            CropFrameRequest(0.0, 0.0, 1.0000001, 0.5),
            CropFrameRequest(Double.NaN, 0.0, 0.5, 0.5),
            CropFrameRequest(0.0, 0.0, Double.POSITIVE_INFINITY, 0.5),
            CropFrameRequest(0.0, Double.NEGATIVE_INFINITY, 0.5, 0.5),
        )
    }
}
