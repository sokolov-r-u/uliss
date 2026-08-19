package io.uliss.user_service.model

import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals

class UserMessageIdTest {

    @Test
    fun `equals returns true for different instances with same values`() {
        val userId = UUID.randomUUID()
        val messageId = UUID.randomUUID()

        assertEquals(UserMessageId(userId, messageId), UserMessageId(userId, messageId))
    }

    @Test
    fun `equals returns false for different userId`() {
        val messageId = UUID.randomUUID()

        assertNotEquals(UserMessageId(UUID.randomUUID(), messageId), UserMessageId(UUID.randomUUID(), messageId))
    }

    @Test
    fun `equals returns false for different messageId`() {
        val userId = UUID.randomUUID()

        assertNotEquals(UserMessageId(userId, UUID.randomUUID()), UserMessageId(userId, UUID.randomUUID()))
    }

    @Test
    fun `equals returns false when compared to null`() {
        assertFalse(UserMessageId(UUID.randomUUID(), UUID.randomUUID()).equals(null))
    }

    @Test
    fun `equals returns false when compared to unrelated type`() {
        assertFalse(UserMessageId(UUID.randomUUID(), UUID.randomUUID()).equals("not a UserMessageId"))
    }

    @Test
    fun `hashCode matches for equal instances`() {
        val userId = UUID.randomUUID()
        val messageId = UUID.randomUUID()

        assertEquals(UserMessageId(userId, messageId).hashCode(), UserMessageId(userId, messageId).hashCode())
    }
}
