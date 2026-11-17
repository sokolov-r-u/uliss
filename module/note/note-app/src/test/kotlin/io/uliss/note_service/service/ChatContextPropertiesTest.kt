package io.uliss.note_service.service

import org.junit.jupiter.api.Test
import kotlin.test.assertFailsWith

class ChatContextPropertiesTest {

    @Test
    fun `a negative overlap fails at startup instead of failing every turn of a summarized chat`() {
        assertFailsWith<IllegalArgumentException> { ChatContextProperties(overlapMessages = -1) }
        assertFailsWith<IllegalArgumentException> { ChatContextProperties(overlapMaxChars = -1) }
    }
}
