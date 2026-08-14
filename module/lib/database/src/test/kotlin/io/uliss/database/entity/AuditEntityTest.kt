package io.uliss.database.entity

import kotlin.test.Test
import kotlin.test.assertTrue

private class TestAuditEntity : AuditEntity()

class AuditEntityTest {

    @Test
    fun `toString includes createdBy and updatedBy and delegates to super`() {
        val entity = TestAuditEntity()
        entity.createdBy = "alice"
        entity.updatedBy = "bob"

        val result = entity.toString()

        assertTrue(result.contains("createdBy='alice'"))
        assertTrue(result.contains("updatedBy='bob'"))
        assertTrue(result.contains("createdAt="))
    }
}
