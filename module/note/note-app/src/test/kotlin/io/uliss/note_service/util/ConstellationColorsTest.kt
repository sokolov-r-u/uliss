package io.uliss.note_service.util

import io.uliss.note_service.model.ConstellationLightness
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class ConstellationColorsTest {

    @Test
    fun `the first root takes the first palette tone`() {
        assertEquals(22, ConstellationColors.pickRootHue(emptyList()))
    }

    @Test
    fun `a new root takes the least used palette tone, the earliest one on a tie`() {
        val everyToneOnce = ConstellationColors.PALETTE
        val hues = everyToneOnce + everyToneOnce.filter { it != 152 && it != 264 }

        assertEquals(152, ConstellationColors.pickRootHue(hues))
    }

    @Test
    fun `hues picked with the slider do not occupy a palette tone`() {
        assertEquals(42, ConstellationColors.pickRootHue(listOf(22, 23, 41, 43)))
    }

    @Test
    fun `a sub-constellation is light right under a root and pale deeper`() {
        assertEquals(ConstellationLightness.LIGHT, ConstellationColors.lightnessForDepth(1))
        assertEquals(ConstellationLightness.PALE, ConstellationColors.lightnessForDepth(2))
        assertEquals(ConstellationLightness.PALE, ConstellationColors.lightnessForDepth(7))
    }
}
