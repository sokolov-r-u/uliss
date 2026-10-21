package io.uliss.database.entity

import jakarta.persistence.MappedSuperclass
import org.springframework.data.annotation.CreatedBy
import org.springframework.data.annotation.LastModifiedBy

@MappedSuperclass
abstract class AuditEntity(
) : UuidEntity() {
    @CreatedBy
    var createdBy: String? = null

    @LastModifiedBy
    var updatedBy: String? = null

    override fun auditFields(): String = ", createdBy='$createdBy', updatedBy='$updatedBy'" + super.auditFields()
}
