package io.uliss.note_service.repository

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.ConstellationEntity
import io.uliss.note_service.model.ConstellationLightness
import io.uliss.note_service.model.NoteEntity
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.ai.chat.client.ChatClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.transaction.IllegalTransactionStateException
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class ConstellationRepositoryIntegrationTest {

    @Autowired
    lateinit var repository: ConstellationRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var transactionTemplate: TransactionTemplate

    @MockitoBean
    lateinit var chatClient: ChatClient

    @Test
    fun `root names are unique per user regardless of case`() {
        val userId = UUID.randomUUID()
        root(userId, "Music")

        assertFailsWith<DataIntegrityViolationException> { root(userId, "music") }
        root(UUID.randomUUID(), "Music")
    }

    @Test
    fun `sibling names are unique regardless of case, the same name in another branch is allowed`() {
        val userId = UUID.randomUUID()
        val music = root(userId, "Music")
        val films = root(userId, "Films")
        child(userId, music.id, "Favourites")

        assertFailsWith<DataIntegrityViolationException> { child(userId, music.id, "FAVOURITES") }
        child(userId, films.id, "Favourites")
    }

    @Test
    fun `a root keeps a hue and no lightness, a sub-constellation the other way round`() {
        val userId = UUID.randomUUID()
        val music = root(userId, "Music")

        assertFailsWith<DataIntegrityViolationException> {
            repository.saveAndFlush(ConstellationEntity(userId, null, "No hue", null, null))
        }
        assertFailsWith<DataIntegrityViolationException> {
            repository.saveAndFlush(ConstellationEntity(userId, null, "Lit", 10, ConstellationLightness.BASE))
        }
        assertFailsWith<DataIntegrityViolationException> {
            repository.saveAndFlush(ConstellationEntity(userId, null, "Out of range", 360, null))
        }
        assertFailsWith<DataIntegrityViolationException> {
            repository.saveAndFlush(ConstellationEntity(userId, music.id, "Hued", 10, ConstellationLightness.BASE))
        }
        assertFailsWith<DataIntegrityViolationException> {
            repository.saveAndFlush(ConstellationEntity(userId, music.id, "Unlit", null, null))
        }
    }

    @Test
    fun `a parent of another user is rejected`() {
        val foreignRoot = root(UUID.randomUUID(), "Music")

        assertFailsWith<DataIntegrityViolationException> { child(UUID.randomUUID(), foreignRoot.id, "Jazz") }
    }

    @Test
    fun `deleting a branch removes its sub-constellations and leaves the rest`() {
        val userId = UUID.randomUUID()
        val music = root(userId, "Music")
        val jazz = child(userId, music.id, "Jazz")
        val miles = child(userId, jazz.id, "Miles")
        val ambient = child(userId, music.id, "Ambient")

        val deleted = transactionTemplate.execute { repository.deleteBranch(userId, jazz.id) }

        assertEquals(2, deleted)
        assertEquals(
            setOf(music.id, ambient.id),
            repository.findByUserIdOrderByCreatedAtAscIdAsc(userId).map { it.id }.toSet(),
        )
        assertTrue(repository.findById(miles.id).isEmpty)
    }

    @Test
    fun `deleting a branch of another user removes nothing`() {
        val music = root(UUID.randomUUID(), "Music")

        val deleted = transactionTemplate.execute { repository.deleteBranch(UUID.randomUUID(), music.id) }

        assertEquals(0, deleted)
        assertTrue(repository.findById(music.id).isPresent)
    }

    @Test
    fun `the tree lock requires a transaction`() {
        assertFailsWith<IllegalTransactionStateException> { repository.lockUserTree(UUID.randomUUID()) }
    }

    @Test
    fun `a note has at most one main constellation`() {
        val userId = UUID.randomUUID()
        val note = noteRepository.save(NoteEntity(userId, "body"))
        val music = root(userId, "Music")
        val films = root(userId, "Films")
        membership(note.id, music.id, userId, main = true)
        membership(note.id, films.id, userId, main = false)
        val books = root(userId, "Books")

        assertFailsWith<DataIntegrityViolationException> { membership(note.id, books.id, userId, main = true) }
    }

    @Test
    fun `a membership must join a note and a constellation of the same user`() {
        val userId = UUID.randomUUID()
        val note = noteRepository.save(NoteEntity(userId, "body"))
        val foreign = root(UUID.randomUUID(), "Music")

        assertFailsWith<DataIntegrityViolationException> { membership(note.id, foreign.id, userId, main = true) }
    }

    @Test
    fun `a parent note must belong to the same user`() {
        val parent = noteRepository.save(NoteEntity(UUID.randomUUID(), "parent"))
        val child = noteRepository.save(NoteEntity(UUID.randomUUID(), "child"))

        assertFailsWith<DataIntegrityViolationException> {
            jdbcTemplate.update("UPDATE note.notes SET parent_note_id = ? WHERE id = ?", parent.id, child.id)
        }
    }

    private fun root(userId: UUID, name: String): ConstellationEntity =
        repository.saveAndFlush(ConstellationEntity(userId, null, name, 264, null))

    private fun child(userId: UUID, parentId: UUID, name: String): ConstellationEntity =
        repository.saveAndFlush(ConstellationEntity(userId, parentId, name, null, ConstellationLightness.LIGHT))

    private fun membership(noteId: UUID, constellationId: UUID, userId: UUID, main: Boolean) {
        jdbcTemplate.update(
            """
                INSERT INTO note.note_constellation (note_id, constellation_id, user_id, is_main, added_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            """.trimIndent(),
            noteId,
            constellationId,
            userId,
            main,
        )
    }
}
