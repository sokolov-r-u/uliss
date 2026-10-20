package io.uliss.note_service.repository

import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.projection.ChatNoteCount
import io.uliss.note_service.model.projection.CurrentChatSummary
import org.springframework.data.domain.Pageable
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

    @Query(
        """
        SELECT n
        FROM ChatNoteEntity cn, NoteEntity n
        WHERE n.id = cn.chatNoteId.noteId
          AND cn.chatNoteId.chatId = :chatId
          AND n.userId = :userId
        ORDER BY n.createdAt DESC, n.id DESC
        """
    )
    fun findNotesByChatId(@Param("userId") userId: UUID, @Param("chatId") chatId: UUID): List<NoteEntity>

    @Query(
        "SELECT cn.chatNoteId.chatId FROM ChatNoteEntity cn " +
            "WHERE cn.chatNoteId.noteId = :noteId AND cn.userId = :userId"
    )
    fun findChatIdsByNoteId(@Param("userId") userId: UUID, @Param("noteId") noteId: UUID): List<UUID>

    @Query(
        """
        SELECT new io.uliss.note_service.model.projection.CurrentChatSummary(
            n.id, n.title, cn.summarizedThroughMessageId)
        FROM ChatNoteEntity cn, NoteEntity n
        WHERE n.id = cn.chatNoteId.noteId
          AND cn.chatNoteId.chatId = :chatId
          AND n.source = :source
          AND n.status = :status
        ORDER BY n.createdAt DESC, n.id DESC
        """
    )
    fun findSummaries(
        @Param("chatId") chatId: UUID,
        @Param("source") source: NoteSource,
        @Param("status") status: NoteStatus,
        pageable: Pageable,
    ): List<CurrentChatSummary>
}
