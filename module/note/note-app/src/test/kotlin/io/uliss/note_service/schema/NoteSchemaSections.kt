package io.uliss.note_service.schema

/** The map of `SCHEMA.md`: every table of the `note` schema belongs to exactly one section. */
object NoteSchemaSections {
    val SECTIONS: List<SchemaSection> = listOf(
        SchemaSection(
            "Notes",
            "User notes and their posters.",
            listOf("notes", "note_posters"),
        ),
        SchemaSection(
            "Constellations",
            "A user's tree of constellations and the notes placed in them.",
            listOf("constellations", "note_constellation"),
        ),
        SchemaSection(
            "Chats",
            "Chats, their turns and messages, and the links from chats to summary notes.",
            listOf("chat", "chat_turn", "chat_message", "chat_note"),
        ),
        SchemaSection(
            "Summaries",
            "Idempotency and in-flight state of chat summarize requests.",
            listOf("summary_request"),
        ),
        SchemaSection(
            "RAG",
            "Embedded note chunks for retrieval, owned per user and note.",
            listOf("rag_chunks"),
        ),
        SchemaSection(
            "User profile",
            "The profile compiled from a user's notes, the user's own input to it, and its full rebuilds.",
            listOf("user_profile", "user_profile_input", "user_profile_rebuild"),
        ),
        SchemaSection(
            "Outbox",
            "Durable, retried background work (summaries, indexing, profile refresh).",
            listOf("outbox_event"),
        ),
    )
}
