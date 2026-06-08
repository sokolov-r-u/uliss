package io.uliss.database.entity

import jakarta.persistence.EntityListeners
import jakarta.persistence.MappedSuperclass
import jakarta.persistence.Version
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.time.Instant

@MappedSuperclass
@EntityListeners(AuditingEntityListener::class)
abstract class AbstractEntity(
    @CreatedDate
    var createdAt: Instant?,
    @LastModifiedDate
    var updatedAt: Instant?,
    @Version
    var version: Long?
) {
    override fun toString(): String {
        return ", createdAt=$createdAt, updatedAt=$updatedAt, version=$version)"
    }
}
