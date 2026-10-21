package io.uliss.auth.repository

import io.uliss.auth.model.SigningKeyEntity
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.CrudRepository
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

interface SigningKeyRepository : CrudRepository<SigningKeyEntity, UUID> {
    fun findTopByOrderByCreatedAtDesc(): SigningKeyEntity?

    /** Serializes key creation until the transaction ends, so replicas starting together agree on one key. */
    @Transactional(propagation = Propagation.MANDATORY)
    @Query(nativeQuery = true, value = "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended('signing_keys', 0))) l")
    fun lockKeyCreation(): Int
}