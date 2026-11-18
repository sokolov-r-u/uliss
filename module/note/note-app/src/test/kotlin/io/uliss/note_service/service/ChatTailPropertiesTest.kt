package io.uliss.note_service.service

import org.junit.jupiter.api.Test
import kotlin.test.assertFailsWith

class ChatTailPropertiesTest {

    @Test
    fun `thresholds out of order fail at startup instead of blocking or never blocking chats`() {
        assertFailsWith<IllegalArgumentException> { ChatTailProperties(softChars = 0, hardChars = 10, summaryInputChars = 20) }
        assertFailsWith<IllegalArgumentException> { ChatTailProperties(softChars = 10, hardChars = 10, summaryInputChars = 20) }
        assertFailsWith<IllegalArgumentException> { ChatTailProperties(softChars = 10, hardChars = 30, summaryInputChars = 20) }
    }
}
