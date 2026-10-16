package io.uliss.note_service.service.tool

import io.uliss.note_service.repository.RetrievedChunk
import io.uliss.note_service.util.ChatPrompts
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NotesSearchToolTest {

    private val properties = NotesSearchProperties(topK = 4, minSimilarity = 0.65, maxCallsPerTurn = 2)
    private val calls = mutableListOf<String>()

    private fun tool(search: NoteSearch) = NotesSearchTool(
        search = search,
        properties = properties,
        onSearchStarted = { calls += "started" },
        onSearchFinished = { calls += "finished" },
    )

    private fun chunk(title: String?, content: String) = RetrievedChunk(
        noteId = UUID.randomUUID(),
        chunkIndex = 0,
        content = content,
        similarity = 0.9,
        noteTitle = title,
        noteCreatedAt = Instant.parse("2026-10-15T19:42:47Z"),
    )

    @Test
    fun `search passes the configured limits and renders each note with its title and date`() {
        val tool = tool { query, limit, minSimilarity ->
            calls += "search:$query:$limit:$minSimilarity"
            listOf(chunk("Satori", "Heavy Japanese psych from 1971."), chunk(null, "Bowie's Low feels cold."))
        }

        val result = tool.searchNotes("  music taste  ")

        assertEquals(listOf("started", "search:music taste:4:0.65", "finished"), calls)
        assertTrue(result.startsWith(ChatPrompts.NOTES_SEARCH_RESULTS_HEADER))
        assertTrue(result.contains("[Note \"Satori\", 2026-10-15]\nHeavy Japanese psych from 1971."))
        assertTrue(result.contains("[Note (untitled), 2026-10-15]\nBowie's Low feels cold."))
    }

    @Test
    fun `an empty result tells the model that nothing was found`() {
        val result = tool { _, _, _ -> emptyList() }.searchNotes("jazz")

        assertEquals(ChatPrompts.NOTES_SEARCH_NOTHING_FOUND, result)
        assertEquals(listOf("started", "finished"), calls)
    }

    @Test
    fun `a failing search is reported to the model instead of failing the turn`() {
        val result = tool { _, _, _ -> throw IllegalStateException("embedding timeout") }.searchNotes("jazz")

        assertEquals(ChatPrompts.NOTES_SEARCH_UNAVAILABLE, result)
        assertEquals(listOf("started", "finished"), calls)
    }

    @Test
    fun `calls beyond the per-turn limit do not search`() {
        var searches = 0
        val tool = tool { _, _, _ -> searches++; emptyList() }

        tool.searchNotes("first")
        tool.searchNotes("second")
        calls.clear()
        val third = tool.searchNotes("third")

        assertEquals(2, searches)
        assertEquals(ChatPrompts.NOTES_SEARCH_LIMIT_REACHED, third)
        assertEquals(emptyList(), calls)
    }

    @Test
    fun `a blank query is rejected without searching`() {
        var searched = false
        val result = tool { _, _, _ -> searched = true; emptyList() }.searchNotes("   ")

        assertEquals(ChatPrompts.NOTES_SEARCH_BLANK_QUERY, result)
        assertEquals(false, searched)
        assertEquals(emptyList(), calls)
    }
}
