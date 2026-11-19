package io.uliss.note_service.util

import org.junit.jupiter.api.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ChatTailLimitTest {

    @Test
    fun `a message that brings the tail past the hard limit is refused`() {
        assertTrue(ChatTailLimit.refuses(tailChars = 50, messageChars = 51, hardChars = 100))
    }

    @Test
    fun `a message that brings the tail exactly to the hard limit is accepted`() {
        assertFalse(ChatTailLimit.refuses(tailChars = 50, messageChars = 50, hardChars = 100))
    }

    @Test
    fun `an empty tail accepts a message longer than the hard limit, or it could never be sent`() {
        assertFalse(ChatTailLimit.refuses(tailChars = 0, messageChars = 500, hardChars = 100))
    }
}
