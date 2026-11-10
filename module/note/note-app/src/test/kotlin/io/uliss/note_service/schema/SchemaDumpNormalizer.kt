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

    fun normalize(dump: String): String {
        val kept = mutableListOf<String>()
        var inLiteral = false
        dump.lines().forEach { raw ->
            // a line inside a multi-line string literal (e.g. a COMMENT ON text) is content, kept verbatim
            if (inLiteral) {
                kept += raw
            } else {
                val line = raw.trimEnd()
                val noise = NOISE_PREFIXES.any { line.trimStart().startsWith(it) }
                val repeatedBlank = line.isEmpty() && kept.lastOrNull()?.isNotEmpty() != true
                if (noise || repeatedBlank) return@forEach
                kept += line
            }
            // pg_dump writes standard strings: a quote is escaped by doubling, so an odd count toggles the state
            if (raw.count { it == '\'' } % 2 == 1) inLiteral = !inLiteral
        }
        return kept.joinToString("\n").trimEnd('\n')
    }
}
