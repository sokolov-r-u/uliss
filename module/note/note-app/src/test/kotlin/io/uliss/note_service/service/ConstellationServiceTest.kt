package io.uliss.note_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.exception.ConstellationMoveCycleException
import io.uliss.note_service.exception.ConstellationNameTakenException
import io.uliss.note_service.model.ConstellationEntity
import io.uliss.note_service.model.ConstellationLightness
import org.junit.jupiter.api.Test
import io.uliss.note_service.model.projection.ConstellationNoteCount
import io.uliss.note_service.model.projection.NoteMembership
import org.mockito.Mockito
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ConstellationServiceTest {

    private val store = InMemoryConstellationStore()
    private val memberships = InMemoryNoteConstellationStore()
    private val now: Instant = Instant.parse("2026-10-19T12:00:00Z")
    private val earlier: Instant = Instant.parse("2026-10-19T10:00:00Z")
    private val service = ConstellationService(store.repository, memberships.store, Clock.fixed(now, ZoneOffset.UTC))
    private val userId = UUID.randomUUID()

    @Test
    fun `the tree gives every node its root's hue and a root the base lightness`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.LIGHT)
        child(jazz, "Miles", ConstellationLightness.DEEP)

        val tree = service.getTree(userId).associateBy { it.name }

        assertEquals(listOf(264, 264, 264), tree.values.map { it.hue })
        assertEquals(ConstellationLightness.BASE, tree.getValue("Music").lightness)
        assertEquals(ConstellationLightness.LIGHT, tree.getValue("Jazz").lightness)
        assertEquals(ConstellationLightness.DEEP, tree.getValue("Miles").lightness)
        assertEquals(jazz.id, tree.getValue("Miles").parentId)
        assertEquals(0, tree.getValue("Music").noteCount)
        assertEquals(0, tree.getValue("Music").ownNoteCount)
    }

    @Test
    fun `the tree carries the stored note counts of every node`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.LIGHT)
        Mockito.`when`(memberships.store.countNotes(userId)).thenReturn(
            listOf(ConstellationNoteCount(music.id, 3, 1), ConstellationNoteCount(jazz.id, 2, 2))
        )

        val tree = service.getTree(userId).associateBy { it.name }

        assertEquals(3 to 1, tree.getValue("Music").let { it.noteCount to it.ownNoteCount })
        assertEquals(2 to 2, tree.getValue("Jazz").let { it.noteCount to it.ownNoteCount })
    }

    @Test
    fun `the tree holds only the user's constellations`() {
        root("Mine", 22)
        store.add(ConstellationEntity(UUID.randomUUID(), null, "Theirs", 42, null))

        assertEquals(listOf("Mine"), service.getTree(userId).map { it.name })
    }

    @Test
    fun `a new root gets a normalized name and the least used palette tone, under the tree lock`() {
        root("Music", 22)

        val created = service.create(userId, "  Films \t noir ", null)

        assertEquals("Films noir", created.name)
        assertEquals(42, created.hue)
        assertNull(created.parentId)
        assertEquals(42, store.rows.getValue(created.id).hue)
        Mockito.verify(store.repository).lockUserTree(userId)
    }

    @Test
    fun `a new sub-constellation is light under a root and pale deeper`() {
        val music = root("Music", 264)

        val jazz = service.create(userId, "Jazz", music.id)
        val miles = service.create(userId, "Miles", jazz.id)

        assertEquals(ConstellationLightness.LIGHT, jazz.lightness)
        assertEquals(ConstellationLightness.PALE, miles.lightness)
        assertEquals(264, miles.hue)
        assertNull(store.rows.getValue(miles.id).hue)
    }

    @Test
    fun `an invalid name is a bad request`() {
        assertFailsWith<BadRequestException> { service.create(userId, "   ", null) }
        assertFailsWith<BadRequestException> { service.create(userId, "a".repeat(41), null) }
    }

    @Test
    fun `a taken name is refused among roots and among siblings regardless of case`() {
        val music = root("Music", 264)
        child(music, "Jazz", ConstellationLightness.LIGHT)
        val films = root("Films", 22)

        assertFailsWith<ConstellationNameTakenException> { service.create(userId, "MUSIC", null) }
        assertFailsWith<ConstellationNameTakenException> { service.create(userId, "jazz", music.id) }
        assertEquals("Jazz", service.create(userId, "Jazz", films.id).name)
    }

    @Test
    fun `a parent of another user is not found`() {
        val foreign = store.add(ConstellationEntity(UUID.randomUUID(), null, "Theirs", 42, null))

        assertFailsWith<NotFoundException> { service.create(userId, "Jazz", foreign.id) }
    }

    @Test
    fun `rename keeps the place and may change only the case of the own name`() {
        val music = root("Music", 264)
        root("Films", 22)

        assertEquals("MUSIC", service.update(userId, music.id, "MUSIC", null, null).name)
        assertFailsWith<ConstellationNameTakenException> { service.update(userId, music.id, "films", null, null) }
    }

    @Test
    fun `a root changes its hue, a sub-constellation its lightness`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.LIGHT)

        assertEquals(10, service.update(userId, music.id, null, 10, null).hue)
        val relit = service.update(userId, jazz.id, null, null, ConstellationLightness.DEEP)

        assertEquals(ConstellationLightness.DEEP, relit.lightness)
        assertEquals(10, relit.hue)
    }

    @Test
    fun `a colour field of the wrong level or out of range is a bad request`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.LIGHT)

        assertFailsWith<BadRequestException> { service.update(userId, music.id, null, null, ConstellationLightness.DEEP) }
        assertFailsWith<BadRequestException> { service.update(userId, jazz.id, null, 10, null) }
        assertFailsWith<BadRequestException> { service.update(userId, music.id, null, 360, null) }
        assertFailsWith<BadRequestException> { service.update(userId, music.id, null, -1, null) }
        assertFailsWith<BadRequestException> { service.update(userId, music.id, null, null, null) }
    }

    @Test
    fun `a missing or foreign constellation is not found`() {
        val foreign = store.add(ConstellationEntity(UUID.randomUUID(), null, "Theirs", 42, null))

        assertFailsWith<NotFoundException> { service.update(userId, foreign.id, "Mine", null, null) }
        assertFailsWith<NotFoundException> { service.move(userId, foreign.id, null) }
        assertFailsWith<NotFoundException> { service.delete(userId, foreign.id, null) }
        assertFailsWith<NotFoundException> { service.delete(userId, UUID.randomUUID(), null) }
    }

    @Test
    fun `a root moved under another root drops its hue and takes a lightness by depth, the branch follows`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.LIGHT)
        val films = root("Films", 22)
        val noir = child(films, "Noir", ConstellationLightness.DEEP)

        val moved = service.move(userId, films.id, jazz.id)

        assertEquals(jazz.id, moved.parentId)
        assertEquals(264, moved.hue)
        assertEquals(ConstellationLightness.PALE, moved.lightness)
        assertNull(store.rows.getValue(films.id).hue)
        val tree = service.getTree(userId).associateBy { it.id }
        assertEquals(264, tree.getValue(noir.id).hue)
        assertEquals(ConstellationLightness.DEEP, tree.getValue(noir.id).lightness)
    }

    @Test
    fun `a sub-constellation made a root keeps the hue it inherited`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.LIGHT)
        val miles = child(jazz, "Miles", ConstellationLightness.PALE)

        val moved = service.move(userId, jazz.id, null)

        assertNull(moved.parentId)
        assertEquals(264, moved.hue)
        assertEquals(ConstellationLightness.BASE, moved.lightness)
        assertNull(store.rows.getValue(jazz.id).lightness)
        assertEquals(ConstellationLightness.PALE, store.rows.getValue(miles.id).lightness)
    }

    @Test
    fun `a sub-constellation moved to another branch keeps its lightness and takes the new root's hue`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.DEEP)
        val films = root("Films", 22)

        val moved = service.move(userId, jazz.id, films.id)

        assertEquals(22, moved.hue)
        assertEquals(ConstellationLightness.DEEP, moved.lightness)
    }

    @Test
    fun `moving into the own branch is a cycle`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.LIGHT)

        assertFailsWith<ConstellationMoveCycleException> { service.move(userId, music.id, music.id) }
        assertFailsWith<ConstellationMoveCycleException> { service.move(userId, music.id, jazz.id) }
    }

    @Test
    fun `a move to a place where the name is taken is refused`() {
        val music = root("Music", 264)
        child(music, "Favourites", ConstellationLightness.LIGHT)
        val films = root("Films", 22)
        val favourites = child(films, "favourites", ConstellationLightness.LIGHT)
        root("Favourites", 42)

        assertFailsWith<ConstellationNameTakenException> { service.move(userId, favourites.id, music.id) }
        assertFailsWith<ConstellationNameTakenException> { service.move(userId, favourites.id, null) }
        assertEquals(films.id, store.rows.getValue(favourites.id).parentId)
    }

    @Test
    fun `a move to the current parent changes nothing`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.DEEP)

        assertEquals(ConstellationLightness.DEEP, service.move(userId, jazz.id, music.id).lightness)
        assertEquals(264, service.move(userId, music.id, null).hue)
    }

    @Test
    fun `a move under a foreign constellation is not found`() {
        val music = root("Music", 264)
        val foreign = store.add(ConstellationEntity(UUID.randomUUID(), null, "Theirs", 42, null))

        assertFailsWith<NotFoundException> { service.move(userId, music.id, foreign.id) }
    }

    @Test
    fun `deleting removes the branch with its sub-constellations`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.LIGHT)
        child(jazz, "Miles", ConstellationLightness.PALE)

        service.delete(userId, jazz.id, null)

        assertEquals(listOf("Music"), service.getTree(userId).map { it.name })
        assertTrue(store.rows.containsKey(music.id))
    }

    @Test
    fun `deleting a branch with notes keeps every note, dropping branch places or moving the note to the target`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.LIGHT)
        val miles = child(jazz, "Miles", ConstellationLightness.PALE)
        val films = root("Films", 42)
        val onlyInside = UUID.randomUUID()
        val alsoOutside = UUID.randomUUID()
        val elsewhere = UUID.randomUUID()
        memberships.put(userId, onlyInside, listOf(NoteMembership(jazz.id, true, earlier), NoteMembership(miles.id, false, earlier)))
        memberships.put(userId, alsoOutside, listOf(NoteMembership(miles.id, true, earlier), NoteMembership(films.id, false, earlier)))
        memberships.put(userId, elsewhere, listOf(NoteMembership(films.id, true, earlier)))

        assertEquals(1, service.getDeletionImpact(userId, jazz.id))
        service.delete(userId, jazz.id, music.id)

        assertEquals(listOf(NoteMembership(music.id, true, now)), memberships.rows[onlyInside])
        assertEquals(listOf(NoteMembership(films.id, true, earlier)), memberships.rows[alsoOutside])
        assertEquals(listOf(NoteMembership(films.id, true, earlier)), memberships.rows[elsewhere])
        assertEquals(setOf("Music", "Films"), service.getTree(userId).map { it.name }.toSet())
        Mockito.verify(store.repository).lockUserTree(userId)
    }

    @Test
    fun `deleting a branch without a target leaves its own notes without a place`() {
        val music = root("Music", 264)
        val note = UUID.randomUUID()
        memberships.put(userId, note, listOf(NoteMembership(music.id, true, earlier)))

        service.delete(userId, music.id, null)

        assertTrue(memberships.rows[note] == null)
        assertTrue(service.getTree(userId).isEmpty())
    }

    @Test
    fun `a delete target inside the branch is a bad request, a missing one is not found, and nothing changes`() {
        val music = root("Music", 264)
        val jazz = child(music, "Jazz", ConstellationLightness.LIGHT)
        val foreign = store.add(ConstellationEntity(UUID.randomUUID(), null, "Theirs", 42, null))
        val note = UUID.randomUUID()
        memberships.put(userId, note, listOf(NoteMembership(jazz.id, true, earlier)))

        assertFailsWith<BadRequestException> { service.delete(userId, music.id, jazz.id) }
        assertFailsWith<BadRequestException> { service.delete(userId, music.id, music.id) }
        assertFailsWith<NotFoundException> { service.delete(userId, music.id, foreign.id) }
        assertFailsWith<NotFoundException> { service.delete(userId, UUID.randomUUID(), null) }
        assertFailsWith<NotFoundException> { service.getDeletionImpact(userId, foreign.id) }
        assertEquals(2, store.rows.values.count { it.userId == userId })
        assertEquals(listOf(NoteMembership(jazz.id, true, earlier)), memberships.rows[note])
    }

    private fun root(name: String, hue: Int): ConstellationEntity =
        store.add(ConstellationEntity(userId, null, name, hue, null))

    private fun child(parent: ConstellationEntity, name: String, lightness: ConstellationLightness) =
        store.add(ConstellationEntity(userId, parent.id, name, null, lightness))
}
