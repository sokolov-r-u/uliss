package io.uliss.note_service.model

import io.uliss.database.entity.AuditEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Table
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.util.UUID

/**
 * What the user tells the profile themselves: [about] goes to the chat, the summaries and the profile writer as is;
 * [rules] only to the profile writer. [rulesVersion] grows with every change of the rules.
 */
@Entity
@Table(name = "user_profile_input", schema = "note")
class UserProfileInputEntity(
    @Column(name = "user_id", updatable = false)
    var userId: UUID,
    var about: String? = null,
    @JdbcTypeCode(SqlTypes.ARRAY)
    var rules: List<String> = emptyList(),
    @Column(name = "rules_version")
    var rulesVersion: Int = 0,
) : AuditEntity() {

    override fun toString(): String =
        "UserProfileInputEntity(id=$id, userId=$userId, rules=${rules.size}, rulesVersion=$rulesVersion" + auditFields()
}
