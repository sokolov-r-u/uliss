package io.uliss.note_service.util

import io.uliss.note_service.model.projection.NoteNode
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NoteHierarchyTest {

    private val t0 = Instant.parse("2026-10-19T10:00:00Z")
    private val bowie = node("Bowie", null, 0)
    private val low = node("Low", bowie.id, 1)
    private val heroes = node("Heroes", bowie.id, 2)
    private val warszawa = node("Warszawa", low.id, 3)
    private val loose = node("Loose thought", null, 4)
    private val hierarchy = NoteHierarchy(listOf(bowie, low, heroes, warszawa, loose))

    @Test
    fun `ancestors run from the top note down to the parent`() {
        assertEquals(listOf(bowie, low), hierarchy.ancestorsOf(warszawa.id))
        assertTrue(hierarchy.ancestorsOf(bowie.id).isEmpty())
        assertEquals(bowie, hierarchy.rootOf(warszawa.id))
        assertEquals(loose, hierarchy.rootOf(loose.id))
    }

    @Test
    fun `children are the direct sub-notes, newest first`() {
        assertEquals(listOf(heroes, low), hierarchy.childrenOf(bowie.id))
        assertTrue(hierarchy.childrenOf(warszawa.id).isEmpty())
    }

    @Test
    fun `a subtree is the note with all its descendants`() {
        assertEquals(setOf(bowie.id, low.id, heroes.id, warszawa.id), hierarchy.subtreeIds(bowie.id))
        assertEquals(setOf(low.id, warszawa.id), hierarchy.subtreeIds(low.id))
    }

    @Test
    fun `a note cannot move under itself or its descendants`() {
        assertFalse(hierarchy.canMoveUnder(bowie.id, bowie.id))
        assertFalse(hierarchy.canMoveUnder(bowie.id, warszawa.id))
        assertFalse(hierarchy.canMoveUnder(low.id, warszawa.id))
        assertTrue(hierarchy.canMoveUnder(warszawa.id, heroes.id))
        assertTrue(hierarchy.canMoveUnder(bowie.id, loose.id))
        assertTrue(hierarchy.canMoveUnder(low.id, bowie.id))
    }

    @Test
    fun `an unknown note has no node, and asking for its family fails`() {
        assertNull(hierarchy.find(UUID.randomUUID()))
        assertFailsWith<NoSuchElementException> { hierarchy.ancestorsOf(UUID.randomUUID()) }
    }

    @Test
    fun `a corrupted cycle is reported instead of looping`() {
        val a = UUID.randomUUID()
        val b = UUID.randomUUID()
        val broken = NoteHierarchy(listOf(NoteNode(a, b, "A", t0), NoteNode(b, a, "B", t0)))

        assertFailsWith<IllegalStateException> { broken.ancestorsOf(a) }
    }

    @Test
    fun `search matches titles regardless of case, prefix matches first, then the newest`() {
        val lowLive = node("Live at the Low end", null, 5)
        val searchable = NoteHierarchy(listOf(bowie, low, heroes, warszawa, loose, lowLive, node(null, null, 6)))

        assertEquals(listOf(low, lowLive), searchable.search("  lOW ", exclude = null, limit = 20))
        assertEquals(listOf(lowLive), searchable.search("the LOW", exclude = null, limit = 20))
        assertTrue(searchable.search("   ", exclude = null, limit = 20).isEmpty())
    }

    @Test
    fun `search leaves out the excluded note and its descendants`() {
        assertEquals(listOf(loose, heroes, bowie), hierarchy.search("e", exclude = low.id, limit = 20))
        assertEquals(emptyList(), hierarchy.search("warszawa", exclude = bowie.id, limit = 20))
        assertEquals(listOf(warszawa), hierarchy.search("warszawa", exclude = heroes.id, limit = 20))
    }

    @Test
    fun `search keeps the limit`() {
        assertEquals(1, hierarchy.search("o", exclude = null, limit = 1).size)
    }

    private fun node(title: String?, parent: UUID?, minute: Long) =
        NoteNode(UUID.randomUUID(), parent, title, t0.plusSeconds(minute * 60))
}
