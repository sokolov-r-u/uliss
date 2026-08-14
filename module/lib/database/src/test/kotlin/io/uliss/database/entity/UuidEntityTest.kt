package io.uliss.database.entity

import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

private class TestUuidEntityA(id: UUID) : UuidEntity(id)
private class TestUuidEntityB(id: UUID) : UuidEntity(id)
private class TestUuidEntityDefault : UuidEntity()

class UuidEntityTest {

    @Test
    fun `equals returns true for same instance`() {
        val entity = TestUuidEntityA(UUID.randomUUID())

        assertTrue(entity == entity)
    }

    @Test
    fun `equals returns true for same class and same id`() {
        val id = UUID.randomUUID()

        assertTrue(TestUuidEntityA(id) == TestUuidEntityA(id))
    }

    @Test
    fun `equals returns false for different class with same id`() {
        val id = UUID.randomUUID()

        assertFalse(TestUuidEntityA(id).equals(TestUuidEntityB(id)))
    }

    @Test
    fun `equals returns false for same class with different id`() {
        assertFalse(TestUuidEntityA(UUID.randomUUID()) == TestUuidEntityA(UUID.randomUUID()))
    }

    @Test
    fun `equals returns false when compared to null`() {
        assertFalse(TestUuidEntityA(UUID.randomUUID()).equals(null))
    }

    @Test
    fun `equals returns false when compared to unrelated type`() {
        assertFalse(TestUuidEntityA(UUID.randomUUID()).equals("not an entity"))
    }

    @Test
    fun `hashCode delegates to id hashCode`() {
        val id = UUID.randomUUID()

        assertEquals(id.hashCode(), TestUuidEntityA(id).hashCode())
    }

    @Test
    fun `default id is generated and non-null`() {
        assertNotNull(TestUuidEntityDefault().id)
    }

    @Test
    fun `toString includes audit fields`() {
        val entity = TestUuidEntityA(UUID.randomUUID())

        val result = entity.toString()

        assertTrue(result.contains("createdAt="))
        assertTrue(result.contains("updatedAt="))
        assertTrue(result.contains("version="))
    }
}
