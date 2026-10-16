package io.uliss.note_service.service.tool

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.exception.NotesSearchAbortedException
import io.uliss.note_service.util.ChatPrompts
import org.springframework.ai.tool.annotation.Tool
import org.springframework.ai.tool.annotation.ToolParam
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/**
 * The model-callable notes search of one chat turn. The model chooses only the query; [search] is already bound to
 * the user. A failed search is reported to the model as text, so the turn still gets an answer without notes.
 *
 * Every call costs a model round trip, so the tool also bounds the loop: the first call over
 * [NotesSearchProperties.maxCallsPerTurn] is refused, the next one ends the turn, and so does a turn that lost its
 * lease ([keepLease] returned `false`).
 */
class NotesSearchTool(
    private val chatId: UUID,
    private val search: NoteSearch,
    private val properties: NotesSearchProperties,
    private val keepLease: () -> Boolean,
    private val onSearchStarted: () -> Unit,
    private val onSearchFinished: () -> Unit,
) {
    private val log = AppLogger.of(NotesSearchTool::class)
    private val calls = AtomicInteger()

    @Tool(name = "searchNotes", description = ChatPrompts.NOTES_SEARCH_TOOL_DESCRIPTION)
    fun searchNotes(@ToolParam(description = ChatPrompts.NOTES_SEARCH_QUERY_DESCRIPTION) query: String): String {
        val call = calls.incrementAndGet()
        if (call > properties.maxCallsPerTurn + 1) {
            throw NotesSearchAbortedException("chat=$chatId kept calling searchNotes after the limit")
        }
        if (call > properties.maxCallsPerTurn) return ChatPrompts.NOTES_SEARCH_LIMIT_REACHED
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return ChatPrompts.NOTES_SEARCH_BLANK_QUERY

        val leaseKept = try {
            keepLease()
        } catch (ex: Exception) {
            log.error("chat=$chatId could not extend the turn lease before a notes search", "searchNotes", ex)
            return ChatPrompts.NOTES_SEARCH_UNAVAILABLE
        }
        if (!leaseKept) throw NotesSearchAbortedException("chat=$chatId turn lost its lease before a notes search")

        onSearchStarted()
        return try {
            val chunks = search.search(trimmed, properties.topK, properties.minSimilarity)
            log.info("chat=$chatId notes search call $call returned ${chunks.size} chunks", "searchNotes")
            ChatPrompts.notesSearchResult(chunks)
        } catch (ex: Exception) {
            log.error("chat=$chatId notes search failed", "searchNotes", ex)
            ChatPrompts.NOTES_SEARCH_UNAVAILABLE
        } finally {
            onSearchFinished()
        }
    }
}
