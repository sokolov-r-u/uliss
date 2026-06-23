package io.uliss.auth.repository

import io.uliss.auth.model.UserEntity
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface UserRepository : CrudRepository<UserEntity, UUID> {

    fun findByEmail(email: String): UserEntity?
}