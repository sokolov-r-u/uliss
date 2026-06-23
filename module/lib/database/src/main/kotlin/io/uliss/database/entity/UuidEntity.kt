package io.uliss.database.entity

import com.fasterxml.uuid.Generators
import jakarta.persistence.Id
import jakarta.persistence.MappedSuperclass
import org.hibernate.Hibernate
import java.util.UUID

private val uuidGenerator = Generators.timeBasedEpochGenerator()

@MappedSuperclass
abstract class UuidEntity(
    @Id
    var id: UUID = uuidGenerator.generate()
) : AbstractEntity() {

    override fun equals(other: Any?): Boolean {
        if (this === other) {
            return true
        }
        if (other == null || Hibernate.getClass<AbstractEntity?>(this) != Hibernate.getClass(other)) {
            return false
        }
        val that = other as UuidEntity
        return id == that.id
    }

    override fun hashCode(): Int {
        return id.hashCode()
    }

    override fun toString(): String {
        return ", createdAt=$createdAt, updatedAt=$updatedAt, version=$version)"
    }
}