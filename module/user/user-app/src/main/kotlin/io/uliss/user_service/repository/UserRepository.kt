package io.uliss.user_service.repository

import io.uliss.user_service.model.UserEntity
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface UserRepository : CrudRepository<UserEntity, UUID> {
    fun findByAuthId(authId: UUID): UserEntity?

    /** Returns 1 when this call created the row, 0 when another transaction already holds [authId]. */
    @Modifying
    @Query(
        nativeQuery = true,
        value = """
            insert into profile.users (id, auth_id, created_at, updated_at, version)
            values (:id, :authId, now(), now(), 0)
            on conflict (auth_id) do nothing
        """,
    )
    fun insertIfAbsent(id: UUID, authId: UUID): Int
}
