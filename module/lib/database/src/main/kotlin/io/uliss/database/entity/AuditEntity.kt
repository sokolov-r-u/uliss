package io.uliss.database.entity

import jakarta.persistence.MappedSuperclass
import org.springframework.data.annotation.CreatedBy
import org.springframework.data.annotation.LastModifiedBy
import java.time.Instant

@MappedSuperclass
abstract class AuditEntity(
    @CreatedBy
    var createdBy: String?,
    @LastModifiedBy
    var updatedBy: String?,
    createdAt: Instant?,
    updatedAt: Instant?,
    version: Long?
) : AbstractEntity(createdAt, updatedAt, version) {
    override fun toString(): String {
        return ", createdBy='$createdBy', updatedBy='$updatedBy'" + super.toString()
    }
}