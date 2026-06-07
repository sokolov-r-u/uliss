package io.uliss.database.entity

import jakarta.persistence.MappedSuperclass
import jakarta.persistence.Version
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import java.time.Instant

@MappedSuperclass
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
