package io.uliss.user_service.repository

import io.uliss.user_service.model.UserEntity
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface UserRepository : CrudRepository<UserEntity, UUID> {
    fun findByAuthId(authId: UUID): UserEntity?
}