package io.uliss.note_service.repository

import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.projection.ChatNoteCount
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.CrudRepository
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface ChatNoteRepository : CrudRepository<ChatNoteEntity, ChatNoteId> {

    @Query(
        """
        SELECT new io.uliss.note_service.model.projection.ChatNoteCount(cn.chatNoteId.chatId, COUNT(cn))
        FROM ChatNoteEntity cn
        WHERE cn.chatNoteId.chatId IN :chatIds
        GROUP BY cn.chatNoteId.chatId
        """
    )
    fun countNotesByChatIds(@Param("chatIds") chatIds: Collection<UUID>): List<ChatNoteCount>
}
