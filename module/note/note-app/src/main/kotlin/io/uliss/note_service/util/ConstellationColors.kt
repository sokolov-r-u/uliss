package io.uliss.note_service.util

import io.uliss.note_service.model.ConstellationLightness

object ConstellationColors {
    /** The design's 13 root tones (OKLCH hue degrees), in palette order. */
    val PALETTE = listOf(22, 42, 70, 88, 112, 152, 176, 200, 232, 264, 292, 316, 348)

    /** The palette tone used by the fewest of [rootHues]; the earliest tone wins a tie. */
    fun pickRootHue(rootHues: Collection<Int>): Int {
        val uses = rootHues.groupingBy { it }.eachCount()
        return PALETTE.minBy { uses[it] ?: 0 }
    }

    /** Default lightness of a new sub-constellation at [depth] (a root is depth 0). */
    fun lightnessForDepth(depth: Int): ConstellationLightness {
        require(depth > 0) { "a root has no lightness" }
        return if (depth == 1) ConstellationLightness.LIGHT else ConstellationLightness.PALE
    }
}
