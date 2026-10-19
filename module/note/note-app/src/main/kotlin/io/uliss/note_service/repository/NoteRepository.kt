package io.uliss.note_service.repository

import io.uliss.note_service.model.NoteEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface NoteRepository : JpaRepository<NoteEntity, UUID> {
    fun findByIdAndUserId(id: UUID, userId: UUID): NoteEntity?
    fun findByUserIdOrderByCreatedAtDescIdDesc(userId: UUID): List<NoteEntity>

    /** The user's notes that belong to the constellation itself (not to its sub-constellations), newest first. */
    @Query(
        nativeQuery = true,
        value = """
            SELECT n.*
            FROM note.notes n
                     JOIN note.note_constellation nc ON nc.note_id = n.id
            WHERE nc.constellation_id = :constellationId
              AND nc.user_id = :userId
              AND n.user_id = :userId
            ORDER BY n.created_at DESC, n.id DESC
        """,
    )
    fun findInConstellation(
        @Param("userId") userId: UUID,
        @Param("constellationId") constellationId: UUID,
    ): List<NoteEntity>

    /** The user's notes with no constellation and no parent note, newest first. */
    @Query(
        nativeQuery = true,
        value = """
            SELECT n.*
            FROM note.notes n
            WHERE n.user_id = :userId
              AND n.parent_note_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM note.note_constellation nc WHERE nc.note_id = n.id)
            ORDER BY n.created_at DESC, n.id DESC
        """,
    )
    fun findWithoutConstellation(@Param("userId") userId: UUID): List<NoteEntity>
}
