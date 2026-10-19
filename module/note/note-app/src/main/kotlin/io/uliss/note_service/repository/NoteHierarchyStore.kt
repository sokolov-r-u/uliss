package io.uliss.note_service.repository

import io.uliss.note_service.model.projection.NoteNode
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/** Parent links between notes (`notes.parent_note_id`); every statement is filtered by the owner. */
@Repository
class NoteHierarchyStore(private val jdbcTemplate: JdbcTemplate) {

    /** Every note of the user with its parent link: the snapshot a `NoteHierarchy` is built from. */
    fun findNodes(userId: UUID): List<NoteNode> =
        jdbcTemplate.query(
            FIND_NODES_SQL,
            { rs, _ ->
                NoteNode(
                    id = rs.getObject("id", UUID::class.java),
                    parentNoteId = rs.getObject("parent_note_id", UUID::class.java),
                    title = rs.getString("title"),
                    createdAt = rs.getTimestamp("created_at").toInstant(),
                )
            },
            userId,
        )

    /** Hangs [noteIds] under [parentId], or makes them top notes when null. Callers hold the user's tree lock. */
    @Transactional(propagation = Propagation.MANDATORY)
    fun setParent(userId: UUID, noteIds: Collection<UUID>, parentId: UUID?) {
        if (noteIds.isEmpty()) return
        jdbcTemplate.update(SET_PARENT_SQL, parentId, noteIds.toTypedArray(), userId)
    }

    /**
     * Deletes [noteIds] in one statement, so a parent may go together with its sub-notes: the parent FK is checked at
     * the end of the statement. Chat links, summary requests, memberships and RAG chunks cascade; chats stay.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    fun deleteNotes(userId: UUID, noteIds: Collection<UUID>) {
        if (noteIds.isEmpty()) return
        jdbcTemplate.update(DELETE_SQL, noteIds.toTypedArray(), userId)
    }

    private companion object {
        const val FIND_NODES_SQL = """
            SELECT id, parent_note_id, title, created_at
            FROM note.notes
            WHERE user_id = ?
        """

        const val SET_PARENT_SQL = """
            UPDATE note.notes
            SET parent_note_id = ?
            WHERE id = ANY (?) AND user_id = ?
        """

        const val DELETE_SQL = """
            DELETE FROM note.notes
            WHERE id = ANY (?) AND user_id = ?
        """
    }
}
