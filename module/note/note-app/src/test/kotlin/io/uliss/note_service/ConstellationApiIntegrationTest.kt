package io.uliss.note_service

import io.uliss.note_service.repository.ConstellationRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.MockMvcResultMatchersDsl
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ConstellationApiIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var repository: ConstellationRepository


    private val userId = UUID.randomUUID()

    @Test
    fun `builds, recolours, moves and deletes a tree`() {
        val music = create("""{"name":" Music "}""").andExpect {
            status { isCreated() }
            jsonPath("$.name") { value("Music") }
            jsonPath("$.parentId") { doesNotExist() }
            jsonPath("$.hue") { value(22) }
            jsonPath("$.lightness") { value("BASE") }
            jsonPath("$.noteCount") { value(0) }
        }.id()
        val jazz = create("""{"name":"Jazz","parentId":"$music"}""").andExpect {
            status { isCreated() }
            jsonPath("$.parentId") { value(music.toString()) }
            jsonPath("$.hue") { value(22) }
            jsonPath("$.lightness") { value("LIGHT") }
        }.id()

        patch(music, """{"hue":264}""").andExpect { jsonPath("$.hue") { value(264) } }
        patch(jazz, """{"name":"Cool jazz","lightness":"DEEP"}""").andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Cool jazz") }
            jsonPath("$.lightness") { value("DEEP") }
        }
        move(jazz, """{"parentId":null}""").andExpect {
            status { isOk() }
            jsonPath("$.parentId") { doesNotExist() }
            jsonPath("$.hue") { value(264) }
            jsonPath("$.lightness") { value("BASE") }
        }
        move(music, """{"parentId":"$jazz"}""").andExpect {
            jsonPath("$.parentId") { value(jazz.toString()) }
            jsonPath("$.lightness") { value("LIGHT") }
        }

        mockMvc.get("/note/constellations") { auth() }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
        }

        mockMvc.delete("/note/constellations/$jazz") { auth() }.andExpect { status { isNoContent() } }
        assertTrue(repository.findByUserIdOrderByCreatedAtAscIdAsc(userId).isEmpty())
    }

    @Test
    fun `an invalid body is a bad request`() {
        val music = create("""{"name":"Music"}""").id()
        val jazz = create("""{"name":"Jazz","parentId":"$music"}""").id()

        create("""{"name":"   "}""").andExpect(badRequest("VALIDATION_ERROR", "$.details.name"))
        create("""{"name":"${"a".repeat(41)}"}""").andExpect(badRequest("BAD_REQUEST_ERROR", "name must be 1 to 40 characters"))
        create("""{}""").andExpect(badRequest("BAD_REQUEST_ERROR"))
        patch(music, """{"hue":360}""").andExpect(badRequest("VALIDATION_ERROR", "$.details.hue"))
        patch(music, """{"lightness":"DEEP"}""").andExpect(badRequest("BAD_REQUEST_ERROR", "a root constellation has no lightness"))
        patch(jazz, """{"hue":10}""").andExpect(badRequest("BAD_REQUEST_ERROR", "only a root constellation has a hue"))
        patch(jazz, """{"lightness":"DIM"}""").andExpect(badRequest("BAD_REQUEST_ERROR"))
        patch(jazz, """{}""").andExpect(badRequest("BAD_REQUEST_ERROR", "nothing to update"))
        // nothing of the refused changes was stored
        val stored = repository.findByUserIdOrderByCreatedAtAscIdAsc(userId).associateBy { it.id }
        assertEquals("Music", stored.getValue(music).name)
        assertEquals(null, stored.getValue(jazz).hue)
    }

    /** 400 with its code and, when given, the message or the field it names. */
    private fun badRequest(code: String, detail: String? = null): MockMvcResultMatchersDsl.() -> Unit = {
        status { isBadRequest() }
        jsonPath("$.code") { value(code) }
        when {
            detail == null -> Unit
            detail.startsWith("$.") -> jsonPath(detail) { exists() }
            else -> jsonPath("$.details.message") { value(detail) }
        }
    }

    @Test
    fun `a taken name and a cycle are conflicts with their codes`() {
        val music = create("""{"name":"Music"}""").id()
        val jazz = create("""{"name":"Jazz","parentId":"$music"}""").id()

        create("""{"name":"music"}""").andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("CONSTELLATION_NAME_TAKEN") }
        }
        move(music, """{"parentId":"$jazz"}""").andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("CONSTELLATION_MOVE_CYCLE") }
        }
    }

    @Test
    fun `a name only the database folds together is still a conflict`() {
        create("""{"name":"I"}""").andExpect { status { isCreated() } }

        // Kotlin folds "İ" to "i̇", PostgreSQL to "i": only the unique index sees the clash.
        create("""{"name":"İ"}""").andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("CONSTELLATION_NAME_TAKEN") }
        }
    }

    @Test
    fun `a foreign constellation or parent is not found`() {
        val foreign = create("""{"name":"Theirs"}""", UUID.randomUUID()).id()
        val mine = create("""{"name":"Mine"}""").id()

        create("""{"name":"Jazz","parentId":"$foreign"}""").andExpect { status { isNotFound() } }
        patch(foreign, """{"name":"Stolen"}""").andExpect { status { isNotFound() } }
        move(foreign, """{"parentId":null}""").andExpect { status { isNotFound() } }
        move(mine, """{"parentId":"$foreign"}""").andExpect { status { isNotFound() } }
        mockMvc.delete("/note/constellations/$foreign") { auth() }.andExpect { status { isNotFound() } }
        mockMvc.get("/note/constellations") { auth() }.andExpect { jsonPath("$.length()") { value(1) } }
    }

    @Test
    fun `a request without a token is unauthorized`() {
        mockMvc.get("/note/constellations").andExpect { status { isUnauthorized() } }
        mockMvc.post("/note/constellations") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Music"}"""
        }.andExpect { status { isUnauthorized() } }
    }

    private fun create(body: String, owner: UUID = userId): ResultActionsDsl =
        mockMvc.post("/note/constellations") {
            auth(owner)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun patch(id: UUID, body: String): ResultActionsDsl =
        mockMvc.patch("/note/constellations/$id") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun move(id: UUID, body: String): ResultActionsDsl =
        mockMvc.post("/note/constellations/$id/move") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun org.springframework.test.web.servlet.MockHttpServletRequestDsl.auth(owner: UUID = userId) {
        with(jwt().jwt { it.claim("userId", owner.toString()) })
    }

    private fun ResultActionsDsl.id(): UUID {
        val body = andReturn().response.contentAsString
        assertEquals(true, body.contains("\"id\""), body)
        return UUID.fromString(objectMapper.readTree(body).get("id").asString())
    }
}
