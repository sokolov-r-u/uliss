package io.uliss.note_service.exception

/**
 * Ends a chat turn from inside the notes search tool. Deliberately not a [RuntimeException]: Spring AI reports runtime
 * tool failures back to the model as text, but rethrows any other cause, which stops the tool-calling loop.
 */
class NotesSearchAbortedException(message: String) : Exception(message)
