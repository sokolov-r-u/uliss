package io.uliss.note_service.schema

/** Strips what `pg_dump` adds per run or per machine, leaving only the DDL of the dumped objects. */
object SchemaDumpNormalizer {
    private val NOISE_PREFIXES = listOf(
        "--", // headers, versions and "Name: …; Type: …" banners
        "SET ",
        "SELECT pg_catalog.set_config(",
        "\\restrict", // random key per run since PG 17.6 / 18.0
        "\\unrestrict",
    )

    fun normalize(dump: String): String = dump.lines()
        .map { it.trimEnd() }
        .filterNot { line -> NOISE_PREFIXES.any { line.trimStart().startsWith(it) } }
        .fold(mutableListOf<String>()) { kept, line ->
            if (line.isNotEmpty() || kept.lastOrNull()?.isNotEmpty() == true) kept += line
            kept
        }
        .joinToString("\n")
        .trimEnd('\n')
}
