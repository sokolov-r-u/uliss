package io.uliss.note_service.repository

import io.uliss.note_service.NoteIntegrationTest
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.projection.NoteNode
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.queryForObject
import org.springframework.transaction.IllegalTransactionStateException
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NoteHierarchyStoreIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var store: NoteHierarchyStore

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Autowired
    lateinit var ragChunkStore: JdbcRagChunkStore

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var transactionTemplate: TransactionTemplate


    private val userId = UUID.randomUUID()

    @Test
    fun `the snapshot holds every note of the user with its parent and title, and nothing of other users`() {
        val bowie = note("Bowie")
        val low = note("Low")
        inTransaction { store.setParent(userId, listOf(low.id), bowie.id) }
        noteRepository.saveAndFlush(NoteEntity(UUID.randomUUID(), "foreign", title = "Foreign"))

        val nodes = store.findNodes(userId).associateBy { it.id }

        assertEquals(setOf(bowie.id, low.id), nodes.keys)
        assertEquals(NoteNode(low.id, bowie.id, "Low", nodes.getValue(low.id).createdAt), nodes[low.id])
        assertEquals(null, nodes.getValue(bowie.id).parentNoteId)
    }

    @Test
    fun `parents change for several notes at once and only for the owner`() {
        val bowie = note("Bowie")
        val low = note("Low")
        val heroes = note("Heroes")
        inTransaction { store.setParent(userId, listOf(low.id, heroes.id), bowie.id) }
        inTransaction { store.setParent(UUID.randomUUID(), listOf(low.id), null) }

        assertEquals(bowie.id, noteRepository.findByIdAndUserId(low.id, userId)?.parentNoteId)
        assertEquals(bowie.id, noteRepository.findByIdAndUserId(heroes.id, userId)?.parentNoteId)

        inTransaction { store.setParent(userId, listOf(low.id), null) }
        assertEquals(null, noteRepository.findByIdAndUserId(low.id, userId)?.parentNoteId)
    }

    @Test
    fun `a whole subtree goes in one statement with its chat links and rag chunks, and the chat stays`() {
        val bowie = note("Bowie")
        val low = note("Low")
        val warszawa = note("Warszawa")
        val loose = note("Loose")
        inTransaction {
            store.setParent(userId, listOf(low.id), bowie.id)
            store.setParent(userId, listOf(warszawa.id), low.id)
        }
        val chat = chatRepository.save(ChatEntity(userId, "Chat"))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, warszawa.id)))
        ragChunkStore.replace(userId, warszawa.id, 0, listOf(EmbeddedChunk(0, "body", emptyMap(), FloatArray(1536) { 0.01f })))

        // Parent before child: the parent FK is checked at the end of the statement, not row by row.
        inTransaction { store.deleteNotes(userId, listOf(bowie.id, low.id, warszawa.id)) }

        assertFalse(noteRepository.existsById(bowie.id))
        assertFalse(noteRepository.existsById(warszawa.id))
        assertTrue(noteRepository.existsById(loose.id))
        assertTrue(chatRepository.existsById(chat.id))
        assertEquals(0L, jdbcTemplate.queryForObject<Long>("SELECT COUNT(*) FROM note.rag_chunks WHERE note_id = ?", warszawa.id))
    }

    @Test
    fun `a stale JPA save of a note does not undo a move made meanwhile`() {
        val bowie = note("Bowie")
        val low = note("Low")
        val stale = noteRepository.findByIdAndUserId(low.id, userId)!!
        inTransaction { store.setParent(userId, listOf(low.id), bowie.id) }

        stale.title = "Low (1977)"
        noteRepository.saveAndFlush(stale)

        val saved = noteRepository.findByIdAndUserId(low.id, userId)
        assertEquals("Low (1977)", saved?.title)
        assertEquals(bowie.id, saved?.parentNoteId)
    }

    @Test
    fun `deleting another user's notes changes nothing`() {
        val bowie = note("Bowie")

        inTransaction { store.deleteNotes(UUID.randomUUID(), listOf(bowie.id)) }

        assertTrue(noteRepository.existsById(bowie.id))
    }

    @Test
    fun `changes require a transaction`() {
        assertFailsWith<IllegalTransactionStateException> { store.setParent(userId, listOf(UUID.randomUUID()), null) }
        assertFailsWith<IllegalTransactionStateException> { store.deleteNotes(userId, listOf(UUID.randomUUID())) }
    }

    private fun inTransaction(block: () -> Unit) = transactionTemplate.executeWithoutResult { block() }

    private fun note(title: String): NoteEntity = noteRepository.saveAndFlush(NoteEntity(userId, "body", title = title))
}
