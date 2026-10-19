package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.exception.ConstellationMoveCycleException
import io.uliss.note_service.exception.ConstellationNotFoundException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.SummaryMode
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.ConstellationRepository
import io.uliss.note_service.repository.NoteConstellationStore
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.service.ConstellationService
import io.uliss.note_service.service.facade.ChatFacade
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.ai.chat.client.ChatClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class ConstellationConcurrencyIntegrationTest {

    @Autowired
    lateinit var service: ConstellationService

    @Autowired
    lateinit var repository: ConstellationRepository

    @Autowired
    lateinit var chatFacade: ChatFacade

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var noteConstellationStore: NoteConstellationStore

    @MockitoBean
    lateinit var chatClient: ChatClient

    @Test
    fun `two simultaneous moves of two roots under each other never close a cycle`() {
        Executors.newFixedThreadPool(2).use { executor ->
            repeat(10) {
                val userId = UUID.randomUUID()
                val a = service.create(userId, "A", null)
                val b = service.create(userId, "B", null)
                val start = CountDownLatch(1)
                val moves = listOf(a.id to b.id, b.id to a.id).map { (id, parentId) ->
                    executor.submit<Result<Unit>> {
                        start.await()
                        runCatching { service.move(userId, id, parentId) }.map { }
                    }
                }
                start.countDown()
                val results = moves.map { it.get(30, TimeUnit.SECONDS) }

                assertEquals(1, results.count { it.isSuccess }, "results $results")
                assertTrue(results.single { it.isFailure }.exceptionOrNull() is ConstellationMoveCycleException)
                val rows = repository.findByUserIdOrderByCreatedAtAscIdAsc(userId)
                assertEquals(1, rows.count { it.parentId == null })
            }
        }
    }

    @Test
    fun `a summary placed in a branch being deleted either is refused or follows the branch's notes`() {
        Executors.newFixedThreadPool(2).use { executor ->
            repeat(10) {
                val userId = UUID.randomUUID()
                val music = service.create(userId, "Music", null)
                val jazz = service.create(userId, "Jazz", music.id)
                val chat = chatRepository.save(ChatEntity(userId, "Race"))
                chatMessageRepository.save(
                    ChatMessageEntity(chat.id, ChatMessageRole.USER, "A thought", ChatMessageStatus.COMPLETE)
                )
                val start = CountDownLatch(1)
                val summary = executor.submit<Result<UUID>> {
                    start.await()
                    runCatching {
                        chatFacade.requestSummary(
                            userId, chat.id, UUID.randomUUID(), SummaryMode.CREATE, null, jazz.id,
                        ).id
                    }
                }
                val deletion = executor.submit<Result<Unit>> {
                    start.await()
                    runCatching { service.delete(userId, jazz.id, music.id) }
                }
                start.countDown()

                assertTrue(deletion.get(30, TimeUnit.SECONDS).isSuccess)
                summary.get(30, TimeUnit.SECONDS).fold(
                    onSuccess = { noteId ->
                        // The summary committed first, so the deletion moved its note to the target as main.
                        val places = noteConstellationStore.findByNote(userId, noteId)
                        assertEquals(listOf(music.id to true), places.map { it.constellationId to it.main })
                    },
                    onFailure = { error ->
                        assertTrue(error is ConstellationNotFoundException, "unexpected $error")
                        assertTrue(noteRepository.findByUserIdOrderByCreatedAtDescIdDesc(userId).isEmpty())
                    },
                )
            }
        }
    }
}
