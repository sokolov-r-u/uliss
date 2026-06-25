package io.uliss.auth.repository

import io.uliss.auth.model.SigningKeyEntity
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface SigningKeyRepository : CrudRepository<SigningKeyEntity, UUID> {
    fun findTopByOrderByCreatedAtDesc(): SigningKeyEntity?
}