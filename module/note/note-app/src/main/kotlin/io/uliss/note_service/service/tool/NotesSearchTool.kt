package io.uliss.note_service.service.tool

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.util.ChatPrompts
import org.springframework.ai.tool.annotation.Tool
import org.springframework.ai.tool.annotation.ToolParam
import java.util.concurrent.atomic.AtomicInteger

/**
 * The model-callable notes search of one chat turn. The model chooses only the query; [search] is already bound to
 * the user. A failed search is reported to the model as text, so the turn still gets an answer without notes.
 */
class NotesSearchTool(
    private val search: NoteSearch,
    private val properties: NotesSearchProperties,
    private val onSearchStarted: () -> Unit,
    private val onSearchFinished: () -> Unit,
) {
    private val log = AppLogger.of(NotesSearchTool::class)
    private val calls = AtomicInteger()

    @Tool(name = "searchNotes", description = ChatPrompts.NOTES_SEARCH_TOOL_DESCRIPTION)
    fun searchNotes(@ToolParam(description = ChatPrompts.NOTES_SEARCH_QUERY_DESCRIPTION) query: String): String {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return ChatPrompts.NOTES_SEARCH_BLANK_QUERY
        if (calls.incrementAndGet() > properties.maxCallsPerTurn) return ChatPrompts.NOTES_SEARCH_LIMIT_REACHED

        onSearchStarted()
        return try {
            val chunks = search.search(trimmed, properties.topK, properties.minSimilarity)
            log.info("notes search returned ${chunks.size} chunks", "searchNotes")
            ChatPrompts.notesSearchResult(chunks)
        } catch (ex: Exception) {
            log.error("notes search failed", "searchNotes", ex)
            ChatPrompts.NOTES_SEARCH_UNAVAILABLE
        } finally {
            onSearchFinished()
        }
    }
}
