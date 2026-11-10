package io.uliss.note_service.schema

import org.springframework.jdbc.core.JdbcTemplate
import org.testcontainers.postgresql.PostgreSQLContainer

/** Reads the migrated `note` schema: catalog queries over JDBC, DDL from `pg_dump` inside the test container. */
class NoteSchemaReader(private val container: PostgreSQLContainer, private val jdbcTemplate: JdbcTemplate) {

    fun tables(): Set<String> = jdbcTemplate.queryForList(
        """
        SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = '$SCHEMA' AND c.relkind IN ('r', 'p') AND c.relname <> 'flyway_schema_history'
        """.trimIndent(),
        String::class.java,
    ).filterNotNull().toSet()

    fun extensions(): List<SchemaExtension> = jdbcTemplate.query(
        """
        SELECT e.extname, n.nspname, e.extversion FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname <> 'plpgsql' ORDER BY e.extname
        """.trimIndent(),
    ) { rs, _ -> SchemaExtension(rs.getString(1), rs.getString(2), rs.getString(3)) }

    /** Objects of the schema that neither a table's dump nor an extension covers, as "kind name". */
    fun strayObjects(): List<String> = jdbcTemplate.queryForList(STRAY_OBJECTS_SQL, String::class.java).filterNotNull()

    fun tableDdl(table: String): String {
        val result = container.execInContainer(
            "pg_dump", "--schema-only", "--no-owner", "--no-privileges",
            "--username", container.username, "--dbname", container.databaseName,
            "--table", "$SCHEMA.$table",
        )
        check(result.exitCode == 0) { "pg_dump of $SCHEMA.$table failed: ${result.stderr}" }
        return SchemaDumpNormalizer.normalize(result.stdout)
    }

    private companion object {
        const val SCHEMA = "note"

        // Members of an extension (deptype 'e') and sequences owned by a column (identity 'i', serial 'a') are skipped;
        // array types follow their element type, and a table's row type follows the table.
        val STRAY_OBJECTS_SQL = """
            SELECT kind || ' ' || name FROM (
                SELECT CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view'
                           WHEN 'S' THEN 'sequence' ELSE 'relation' END AS kind,
                       c.relname AS name, 'pg_class'::regclass AS classid, c.oid AS objid
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = '$SCHEMA' AND c.relkind IN ('v', 'm', 'S', 'f')
                  AND NOT EXISTS (SELECT 1 FROM pg_depend d
                                  WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                                    AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i'))
                UNION ALL
                SELECT CASE p.prokind WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate' ELSE 'function' END,
                       p.proname, 'pg_proc'::regclass, p.oid
                FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = '$SCHEMA'
                UNION ALL
                SELECT 'type', t.typname, 'pg_type'::regclass, t.oid
                FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = '$SCHEMA' AND t.typcategory <> 'A'
                  AND (t.typrelid = 0 OR (SELECT c.relkind FROM pg_class c WHERE c.oid = t.typrelid) = 'c')
            ) o
            WHERE NOT EXISTS (SELECT 1 FROM pg_depend d
                              WHERE d.classid = o.classid AND d.objid = o.objid AND d.deptype = 'e')
            ORDER BY 1
        """.trimIndent()
    }
}
