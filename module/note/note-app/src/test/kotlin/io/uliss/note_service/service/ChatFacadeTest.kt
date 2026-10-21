package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.eqValue
import io.uliss.note_service.captorFor
import io.uliss.note_service.captureValue
import io.uliss.note_service.dto.internal.ChatMessageCursorPage
import io.uliss.note_service.exception.ChatTurnAlreadyGeneratingException
import io.uliss.note_service.exception.SummaryNoteConflictException
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.SummaryMode
import io.uliss.note_service.model.projection.CurrentChatSummary
import io.uliss.note_service.repository.RetrievedChunk
import io.uliss.note_service.service.facade.ChatFacade
import io.uliss.note_service.service.output.AssistantReplyStream
import io.uliss.note_service.service.tool.NoteSearch
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import reactor.core.publisher.Flux
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertSame

class ChatFacadeTest {

    private val chatService = Mockito.mock(ChatService::class.java)
    private val assistantService = Mockito.mock(AssistantService::class.java)
    private val noteService = Mockito.mock(NoteService::class.java)
    private val noteSummaryService = Mockito.mock(NoteSummaryService::class.java)
    private val chatTurnService = Mockito.mock(ChatTurnService::class.java)
    private val ragService = Mockito.mock(RagService::class.java)
    private val chatFacade = ChatFacade(chatService, assistantService, noteService, noteSummaryService, chatTurnService, ragService)

    @Test
    fun `streamReply creates a missing chat and exposes its backend identity`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val chat = ChatEntity(userId, "hello").apply { id = chatId }
        val assistantReply = AssistantReplyStream(turnId, Flux.empty(), chatId)
        Mockito.`when`(chatService.createChat(userId, idempotencyKey, "hello"))
            .thenReturn(chat)
        Mockito.`when`(
            assistantService.streamReply(
                eqValue(userId), eqValue(chatId), eqValue(idempotencyKey), eqValue("hello"), anyValue(),
            ),
        ).thenReturn(assistantReply)

        val result = chatFacade.streamReply(userId, null, idempotencyKey, "hello")

        assertEquals(chatId, result.chatId)
        assertEquals(turnId, result.turnId)
        assertSame(assistantReply.events, result.events)
    }

    @Test
    fun `streamReply requires an existing chat without invoking creation`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val turnId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val chat = ChatEntity(userId, "hello").apply { id = chatId }
        val assistantReply = AssistantReplyStream(turnId, Flux.empty(), chatId)
        Mockito.`when`(chatService.getOwnedChat(userId, chatId)).thenReturn(chat)
        Mockito.`when`(
            assistantService.streamReply(
                eqValue(userId), eqValue(chatId), eqValue(idempotencyKey), eqValue("hello"), anyValue(),
            ),
        ).thenReturn(assistantReply)

        val result = chatFacade.streamReply(userId, chatId, idempotencyKey, "hello")

        assertSame(assistantReply, result)
        Mockito.verify(chatService, Mockito.never()).createChat(userId, idempotencyKey, "hello")
    }

    @Test
    fun `streamReply never creates a chat when the requested chat is missing`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(chatService.getOwnedChat(userId, chatId))
            .thenThrow(NotFoundException("chat id=$chatId not found"))

        assertFailsWith<NotFoundException> {
            chatFacade.streamReply(userId, chatId, idempotencyKey, "hello")
        }

        Mockito.verify(chatService, Mockito.never()).createChat(userId, idempotencyKey, "hello")
        Mockito.verifyNoInteractions(assistantService)
    }

    @Test
    fun `the notes search of a reply leaves out the chat's current summary note`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val currentNoteId = UUID.randomUUID()
        val chat = ChatEntity(userId, "hello").apply { id = chatId }
        val found = listOf(RetrievedChunk(UUID.randomUUID(), 0, "Loves Satori.", 0.9, "Satori", Instant.EPOCH))
        Mockito.`when`(chatService.getOwnedChat(userId, chatId)).thenReturn(chat)
        Mockito.`when`(noteSummaryService.findCurrentChatSummary(chatId))
            .thenReturn(null, CurrentChatSummary(currentNoteId, "Trip", null))
        Mockito.`when`(ragService.search(userId, "music", 5, 0.7)).thenReturn(found)
        Mockito.`when`(ragService.searchExcluding(userId, "music", 5, 0.7, currentNoteId)).thenReturn(found)

        chatFacade.streamReply(userId, chatId, idempotencyKey, "hello")
        val captor = captorFor<NoteSearch>(NoteSearch::class.java)
        Mockito.verify(assistantService).streamReply(
            eqValue(userId), eqValue(chatId), eqValue(idempotencyKey), eqValue("hello"),
            captor.captureValue(),
        )

        assertSame(found, captor.value.search("music", 5, 0.7))
        Mockito.verify(ragService).search(userId, "music", 5, 0.7)
        assertSame(found, captor.value.search("music", 5, 0.7))
        Mockito.verify(ragService).searchExcluding(userId, "music", 5, 0.7, currentNoteId)
    }

    @Test
    fun `requestSummary rejects a chat with no messages`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(null)

        assertFailsWith<BadRequestException> {
            chatFacade.requestSummary(userId, chatId, idempotencyKey, SummaryMode.CREATE, null)
        }
        Mockito.verifyNoInteractions(noteService)
    }

    @Test
    fun `requestSummary uses the separately loaded latest message as the immutable summary boundary`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        val throughMessageId = UUID.randomUUID()
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(throughMessageId)
        val savedNote = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(
            noteSummaryService.requestChatSummary(userId, chatId, throughMessageId, idempotencyKey)
        ).thenReturn(savedNote)

        val result = chatFacade.requestSummary(userId, chatId, idempotencyKey, SummaryMode.CREATE, null)

        assertSame(savedNote, result)
        Mockito.verify(chatService).getLatestMessageId(userId, chatId)
        Mockito.verify(noteSummaryService).requestChatSummary(userId, chatId, throughMessageId, idempotencyKey)
        Mockito.verify(chatService).touchActivity(userId, chatId)
    }

    @Test
    fun `requestSummary passes the chosen constellation to the new note`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val latest = UUID.randomUUID()
        val constellationId = UUID.randomUUID()
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(latest)
        val savedNote = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteSummaryService.requestChatSummary(userId, chatId, latest, key, constellationId)).thenReturn(savedNote)

        val result = chatFacade.requestSummary(userId, chatId, key, SummaryMode.CREATE, null, constellationId)

        assertSame(savedNote, result)
    }

    @Test
    fun `requestSummary passes the chosen parent note to the new note`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val latest = UUID.randomUUID()
        val parentNoteId = UUID.randomUUID()
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(latest)
        val savedNote = NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        Mockito.`when`(noteSummaryService.requestChatSummary(userId, chatId, latest, key, null, parentNoteId)).thenReturn(savedNote)

        val result = chatFacade.requestSummary(userId, chatId, key, SummaryMode.CREATE, null, null, parentNoteId)

        assertSame(savedNote, result)
    }

    @Test
    fun `requestSummary takes one place, a constellation or a parent note, and none for an update`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val current = CurrentChatSummary(UUID.randomUUID(), "Trip", UUID.randomUUID())
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(UUID.randomUUID())
        Mockito.`when`(noteSummaryService.findCurrentChatSummary(chatId)).thenReturn(current)

        assertFailsWith<BadRequestException> {
            chatFacade.requestSummary(
                userId, chatId, UUID.randomUUID(), SummaryMode.CREATE, null, UUID.randomUUID(), UUID.randomUUID(),
            )
        }
        assertFailsWith<BadRequestException> {
            chatFacade.requestSummary(
                userId, chatId, UUID.randomUUID(), SummaryMode.UPDATE, current.noteId, null, UUID.randomUUID(),
            )
        }
        Mockito.verify(noteSummaryService, Mockito.never()).findSummaryReplay(anyValue(), anyValue(), anyValue())
        Mockito.verify(chatService, Mockito.never()).touchActivity(anyValue(), anyValue())
    }

    @Test
    fun `requestSummary refuses a place for an update before reserving anything`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val current = CurrentChatSummary(UUID.randomUUID(), "Trip", UUID.randomUUID())
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(UUID.randomUUID())
        Mockito.`when`(noteSummaryService.findCurrentChatSummary(chatId)).thenReturn(current)

        assertFailsWith<BadRequestException> {
            chatFacade.requestSummary(userId, chatId, key, SummaryMode.UPDATE, current.noteId, UUID.randomUUID())
        }
        Mockito.verify(noteSummaryService, Mockito.never()).requestChatSummaryUpdate(
            anyValue(), anyValue(), anyValue(), anyValue(), anyValue(), anyValue(),
        )
        Mockito.verify(chatService, Mockito.never()).touchActivity(anyValue(), anyValue())
    }

    @Test
    fun `getChats attaches note counts and defaults missing counts to zero`() {
        val userId = UUID.randomUUID()
        val withNotes = ChatEntity(userId, "With notes")
        val withoutNotes = ChatEntity(userId, "Without notes")
        Mockito.`when`(chatService.getChats(userId)).thenReturn(listOf(withNotes, withoutNotes))
        Mockito.`when`(noteService.getNoteCounts(listOf(withNotes.id, withoutNotes.id)))
            .thenReturn(mapOf(withNotes.id to 2))

        val result = chatFacade.getChats(userId)

        assertEquals(listOf(withNotes, withoutNotes), result.map { it.chat })
        assertEquals(listOf(2, 0), result.map { it.noteCount })
    }

    @Test
    fun `getChat returns an owned chat with its note count`() {
        val userId = UUID.randomUUID()
        val chat = ChatEntity(userId, "Trip planning")
        Mockito.`when`(chatService.getOwnedChat(userId, chat.id)).thenReturn(chat)
        Mockito.`when`(noteService.getNoteCounts(listOf(chat.id))).thenReturn(mapOf(chat.id to 1))

        val result = chatFacade.getChat(userId, chat.id)

        assertSame(chat, result.chat)
        assertEquals(1, result.noteCount)
    }

    @Test
    fun `renameChat returns the renamed chat with its note count`() {
        val userId = UUID.randomUUID()
        val chat = ChatEntity(userId, "New title")
        Mockito.`when`(chatService.renameChat(userId, chat.id, " New title ")).thenReturn(chat)
        Mockito.`when`(noteService.getNoteCounts(listOf(chat.id))).thenReturn(emptyMap())

        val result = chatFacade.renameChat(userId, chat.id, " New title ")

        assertSame(chat, result.chat)
        assertEquals(0, result.noteCount)
    }

    @Test
    fun `deleteChat locks the chat against live turns before deleting it`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()

        chatFacade.deleteChat(userId, chatId)

        val order = Mockito.inOrder(chatTurnService, chatService)
        order.verify(chatTurnService).lockChatForDeletion(userId, chatId)
        order.verify(chatService).deleteChat(userId, chatId)
        Mockito.verifyNoInteractions(noteService)
    }

    @Test
    fun `deleteChat keeps the chat when a turn is still generating`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.doThrow(ChatTurnAlreadyGeneratingException(chatId, UUID.randomUUID()))
            .`when`(chatTurnService).lockChatForDeletion(userId, chatId)

        assertFailsWith<ChatTurnAlreadyGeneratingException> { chatFacade.deleteChat(userId, chatId) }

        Mockito.verifyNoInteractions(chatService)
    }

    @Test
    fun `requestSummary replays a known key before applying mode rules`() {
        val (userId, chatId, key) = Triple(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())
        val note = NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(UUID.randomUUID())
        Mockito.`when`(noteSummaryService.findSummaryReplay(userId, chatId, key)).thenReturn(note)

        assertSame(note, chatFacade.requestSummary(userId, chatId, key, SummaryMode.UPDATE, UUID.randomUUID()))
        Mockito.verify(noteSummaryService, Mockito.never()).findCurrentChatSummary(anyValue())
        Mockito.verify(chatService, Mockito.never()).touchActivity(anyValue(), anyValue())
    }

    @Test
    fun `requestSummary rejects create when the chat already has a current note`() {
        val (userId, chatId, key) = Triple(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(UUID.randomUUID())
        Mockito.`when`(noteSummaryService.findCurrentChatSummary(chatId))
            .thenReturn(CurrentChatSummary(UUID.randomUUID(), "Title", UUID.randomUUID()))

        assertFailsWith<SummaryNoteConflictException> {
            chatFacade.requestSummary(userId, chatId, key, SummaryMode.CREATE, null)
        }
        Mockito.verify(chatService, Mockito.never()).touchActivity(anyValue(), anyValue())
    }

    @Test
    fun `requestSummary rejects an update of a note that is no longer current`() {
        val (userId, chatId, key) = Triple(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(UUID.randomUUID())
        Mockito.`when`(noteSummaryService.findCurrentChatSummary(chatId))
            .thenReturn(CurrentChatSummary(UUID.randomUUID(), "Title", UUID.randomUUID()))

        assertFailsWith<SummaryNoteConflictException> {
            chatFacade.requestSummary(userId, chatId, key, SummaryMode.UPDATE, UUID.randomUUID())
        }
    }

    @Test
    fun `requestSummary rejects an update without new messages or without a target`() {
        val (userId, chatId, key) = Triple(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())
        val latest = UUID.randomUUID()
        val current = CurrentChatSummary(UUID.randomUUID(), "Title", latest)
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(latest)
        Mockito.`when`(noteSummaryService.findCurrentChatSummary(chatId)).thenReturn(current)

        assertFailsWith<BadRequestException> {
            chatFacade.requestSummary(userId, chatId, key, SummaryMode.UPDATE, current.noteId)
        }
        assertFailsWith<BadRequestException> {
            chatFacade.requestSummary(userId, chatId, key, SummaryMode.UPDATE, null)
        }
    }

    @Test
    fun `requestSummary updates the current note from its boundary to the latest message`() {
        val (userId, chatId, key) = Triple(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())
        val latest = UUID.randomUUID()
        val current = CurrentChatSummary(UUID.randomUUID(), "Title", UUID.randomUUID())
        val note = NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY)
        Mockito.`when`(chatService.getLatestMessageId(userId, chatId)).thenReturn(latest)
        Mockito.`when`(noteSummaryService.findCurrentChatSummary(chatId)).thenReturn(current)
        Mockito.`when`(
            noteSummaryService.requestChatSummaryUpdate(userId, chatId, current.noteId, current.throughMessageId, latest, key)
        ).thenReturn(note)

        assertSame(note, chatFacade.requestSummary(userId, chatId, key, SummaryMode.UPDATE, current.noteId))
        Mockito.verify(chatService).touchActivity(userId, chatId)
    }

    @Test
    fun `getMessages attaches the summary state to the latest page only`() {
        val (userId, chatId) = Pair(UUID.randomUUID(), UUID.randomUUID())
        val current = CurrentChatSummary(UUID.randomUUID(), "Title", UUID.randomUUID())
        val page = ChatMessageCursorPage(emptyList(), null, false)
        val before = UUID.randomUUID()
        Mockito.`when`(chatService.getMessages(userId, chatId, null, 50)).thenReturn(page)
        Mockito.`when`(chatService.getMessages(userId, chatId, before, 50)).thenReturn(page)
        Mockito.`when`(noteSummaryService.findCurrentChatSummary(chatId)).thenReturn(current)

        assertEquals(current, chatFacade.getMessages(userId, chatId, null, 50).summary)
        assertNull(chatFacade.getMessages(userId, chatId, before, 50).summary)
    }

    @Test
    fun `chat notes of a missing or foreign chat are not found without reading notes`() {
        val userId = UUID.randomUUID()
        val chatId = UUID.randomUUID()
        Mockito.`when`(chatService.getOwnedChat(userId, chatId)).thenThrow(NotFoundException("chat not found"))

        assertFailsWith<NotFoundException> { chatFacade.getChatNotes(userId, chatId) }
        Mockito.verify(noteService, Mockito.never()).getChatNotes(anyValue(), anyValue())
    }
}
