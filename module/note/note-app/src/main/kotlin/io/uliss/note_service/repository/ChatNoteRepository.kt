package io.uliss.note_service.repository

import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import org.springframework.data.repository.CrudRepository
import org.springframework.stereotype.Repository

@Repository
interface ChatNoteRepository : CrudRepository<ChatNoteEntity, ChatNoteId>
