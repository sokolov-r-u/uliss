package io.uliss.note_service.repository

import io.uliss.note_service.model.UserProfileEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface UserProfileRepository : JpaRepository<UserProfileEntity, UUID> {
    fun findByUserId(userId: UUID): UserProfileEntity?
}
