package io.uliss.note_service.repository

import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.projection.ChatNoteCount
import io.uliss.note_service.model.projection.CurrentChatSummary
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.CrudRepository
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface ChatNoteRepository : CrudRepository<ChatNoteEntity, ChatNoteId> {

    /** Notes of the chat that cover [messageId] now cover the message before it (null when it is the first). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        value = """
            UPDATE note.chat_note
            SET summarized_through_message_id = (
                SELECT previous.id
                FROM note.chat_message previous
                JOIN note.chat_message boundary ON boundary.id = :messageId AND boundary.chat_id = :chatId
                WHERE previous.chat_id = :chatId
                  AND (previous.created_at, previous.id) < (boundary.created_at, boundary.id)
                ORDER BY previous.created_at DESC, previous.id DESC
                LIMIT 1
            )
            WHERE chat_id = :chatId AND summarized_through_message_id = :messageId
        """,
        nativeQuery = true,
    )
    fun moveBoundaryBefore(@Param("chatId") chatId: UUID, @Param("messageId") messageId: UUID): Int

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
