package io.uliss.note_service.dto.internal

/** A step of a model rewrite of a note's text; nothing of it is persisted. */
sealed interface NoteAiEditEvent {
    data class AppendText(val text: String) : NoteAiEditEvent
    data object Completed : NoteAiEditEvent
    data object Failed : NoteAiEditEvent
}
