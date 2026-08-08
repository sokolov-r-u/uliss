package io.uliss.note_service.repository

import io.uliss.note_service.model.NoteEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface NoteRepository : JpaRepository<NoteEntity, UUID>
