package io.uliss.user_service.model

import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertTrue

class UserEntityTest {

    @Test
    fun `toString includes id, authId, displayName and delegates to super`() {
        val authId = UUID.randomUUID()
        val entity = UserEntity(authId, "John Doe")

        val result = entity.toString()

        assertTrue(result.contains("UserEntity(id=${entity.id}"))
        assertTrue(result.contains("authId=$authId"))
        assertTrue(result.contains("displayName='John Doe'"))
        assertTrue(result.contains("createdAt="))
    }
}
