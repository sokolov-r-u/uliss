package io.uliss.database.entity

import org.hibernate.proxy.HibernateProxy
import org.hibernate.proxy.LazyInitializer
import java.lang.reflect.Proxy
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

private class TestUuidEntityA(id: UUID) : UuidEntity(id)
private class TestUuidEntityB(id: UUID) : UuidEntity(id)
private class TestUuidEntityDefault : UuidEntity()

/** What Hibernate hands out for a lazy reference: a subclass whose persistent class is the real entity. */
private class ProxyOfA(id: UUID, private val initializer: LazyInitializer) : UuidEntity(id), HibernateProxy {
    override fun getHibernateLazyInitializer(): LazyInitializer = initializer
    override fun writeReplace(): Any = this
}

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
    fun `toString names the entity and its id and includes audit fields`() {
        val id = UUID.randomUUID()

        val result = TestUuidEntityA(id).toString()

        assertTrue(result.startsWith("TestUuidEntityA(id=$id"), result)
        assertTrue(result.contains("createdAt="))
        assertTrue(result.contains("updatedAt="))
        assertTrue(result.contains("version="))
    }

    @Test
    fun `an uninitialized hibernate proxy equals the entity it stands for`() {
        val id = UUID.randomUUID()
        val initializer = Proxy.newProxyInstance(
            LazyInitializer::class.java.classLoader,
            arrayOf(LazyInitializer::class.java),
        ) { _, method, _ ->
            when (method.name) {
                "getPersistentClass" -> TestUuidEntityA::class.java
                "getImplementation" -> TestUuidEntityA(id)
                else -> null
            }
        } as LazyInitializer
        val proxy = ProxyOfA(id, initializer)

        assertTrue(TestUuidEntityA(id) == proxy)
        assertFalse(TestUuidEntityB(id) == proxy)
    }
}
