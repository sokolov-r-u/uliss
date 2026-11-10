package io.uliss.note_service.schema

import net.jqwik.api.ForAll
import net.jqwik.api.Property
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class SchemaDumpNormalizerTest {

    private fun dump(restrictKey: String, serverVersion: String) = """
        --
        -- PostgreSQL database dump
        --

        \restrict $restrictKey

        -- Dumped from database version $serverVersion
        -- Dumped by pg_dump version $serverVersion

        SET statement_timeout = 0;
        SET client_encoding = 'UTF8';
        SELECT pg_catalog.set_config('search_path', '', false);
        SET default_tablespace = '';

        --
        -- Name: notes; Type: TABLE; Schema: note; Owner: -
        --

        CREATE TABLE note.notes (
            id uuid NOT NULL,
            body text DEFAULT '--not a comment'::text NOT NULL
        );


        COMMENT ON TABLE note.notes IS 'User notes';

        --
        -- Name: notes notes_pkey; Type: CONSTRAINT; Schema: note; Owner: -
        --

        ALTER TABLE ONLY note.notes
            ADD CONSTRAINT notes_pkey PRIMARY KEY (id);

        --
        -- PostgreSQL database dump complete
        --

        \unrestrict $restrictKey

    """.trimIndent()

    private val ddl = """
        CREATE TABLE note.notes (
            id uuid NOT NULL,
            body text DEFAULT '--not a comment'::text NOT NULL
        );

        COMMENT ON TABLE note.notes IS 'User notes';

        ALTER TABLE ONLY note.notes
            ADD CONSTRAINT notes_pkey PRIMARY KEY (id);
    """.trimIndent()

    @Test
    fun `keeps only the DDL, without headers, settings, banners and the restrict key`() {
        assertEquals(ddl, SchemaDumpNormalizer.normalize(dump("aB3xYz", "18.1 (Debian 18.1-1.pgdg13+2)")))
    }

    @Test
    fun `windows line endings and trailing spaces do not change the result`() {
        val messy = dump("k", "18.1").lines().joinToString("\r\n") { "$it  " }

        assertEquals(ddl, SchemaDumpNormalizer.normalize(messy))
    }

    @Property(tries = 200)
    fun `a different restrict key or server version gives the same text`(
        @ForAll key: String,
        @ForAll version: String,
    ) {
        val safeKey = key.filter { it.isLetterOrDigit() }.ifEmpty { "k" }
        val safeVersion = version.filterNot { it == '\n' || it == '\r' }

        assertEquals(ddl, SchemaDumpNormalizer.normalize(dump(safeKey, safeVersion)))
    }

    @Property(tries = 200)
    fun `normalizing twice changes nothing`(@ForAll text: String) {
        val once = SchemaDumpNormalizer.normalize(text)

        assertEquals(once, SchemaDumpNormalizer.normalize(once))
    }

    @Property(tries = 200)
    fun `text without string literals never keeps two blank lines in a row`(@ForAll text: String) {
        val once = SchemaDumpNormalizer.normalize(text.replace("'", ""))

        assertFalse("\n\n\n" in once, once)
    }

    @Test
    fun `lines inside a multi-line string literal are content, not noise`() {
        val comment = """
            |COMMENT ON COLUMN note.notes.status IS 'Lifecycle:
            |-- set by the outbox
            |
            |
            |SET only by the summary handler; it''s never null';
        """.trimMargin()

        assertEquals(comment, SchemaDumpNormalizer.normalize("SET x = 0;\n\n$comment\n\n-- Name: trailer\n"))
    }
}
