import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {parseSseStream} from '../lib/sse'

export type NoteStatus = 'GENERATING' | 'READY' | 'FAILED'
export type NoteSource = 'MANUAL' | 'CHAT_SUMMARY'

export interface Note {
    id: string
    source: NoteSource
    status: NoteStatus
    title?: string
    content: string | null
    createdAt?: string
    updatedAt?: string
    /** A READY note whose summary update is still running: its content changes when the update is applied. */
    updating?: boolean
    /** Stored version; an edit sends it back so the service refuses to overwrite a newer one. */
    version?: number
}

export interface NoteEdit {
    title: string
    content: string
    version: number
}

export interface ChatSummaryResponse {
    noteId: string
    chatId: string
    status: NoteStatus
    createdAt?: string
}

export interface NoteStatusEvent {
    noteId: string
    status: NoteStatus
    updatedAt?: string
    updating?: boolean
}

export type NoteApiFailureKind = 'http' | 'transport' | 'protocol'

export class NoteApiError extends Error {
    constructor(
        public readonly kind: NoteApiFailureKind,
        message: string,
        public readonly status?: number,
        options?: ErrorOptions,
        /** The service's error code (for example `NOTE_VERSION_CONFLICT`), when the body carried one. */
        public readonly code?: string,
    ) {
        super(message, options)
        this.name = 'NoteApiError'
    }
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value === '') {
        throw new NoteApiError('protocol', `invalid ${field} in note response`)
    }
    return value
}

function optionalString(value: unknown, field: string): string | undefined {
    if (value == null) return undefined
    return requiredString(value, field)
}

/** Absent means false, so a response without the field reads as a settled note. */
function optionalFlag(value: unknown, field: string): boolean {
    if (value === undefined || value === null) return false
    if (typeof value !== 'boolean') throw new NoteApiError('protocol', `invalid ${field} in note response`)
    return value
}

function optionalVersion(value: unknown): number | undefined {
    if (value == null) return undefined
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new NoteApiError('protocol', 'invalid version in note response')
    }
    return value
}

function parseStatus(value: unknown): NoteStatus {
    if (value === 'GENERATING' || value === 'READY' || value === 'FAILED') return value
    throw new NoteApiError('protocol', 'invalid status in note response')
}

function parseSource(value: unknown): NoteSource {
    if (value === 'MANUAL' || value === 'CHAT_SUMMARY') return value
    throw new NoteApiError('protocol', 'invalid source in note response')
}

function parseNote(value: unknown): Note {
    if (!isRecord(value)) throw new NoteApiError('protocol', 'invalid note response')
    if (value.content !== null && typeof value.content !== 'string') {
        throw new NoteApiError('protocol', 'invalid content in note response')
    }
    return {
        id: requiredString(value.id, 'id'),
        source: parseSource(value.source),
        status: parseStatus(value.status),
        title: optionalString(value.title, 'title'),
        content: value.content,
        createdAt: optionalString(value.createdAt, 'createdAt'),
        updatedAt: optionalString(value.updatedAt, 'updatedAt'),
        updating: optionalFlag(value.updating, 'updating'),
        version: optionalVersion(value.version),
    }
}

function parseSummary(value: unknown): ChatSummaryResponse {
    if (!isRecord(value)) throw new NoteApiError('protocol', 'invalid summary response')
    return {
        noteId: requiredString(value.noteId, 'noteId'),
        chatId: requiredString(value.chatId, 'chatId'),
        status: parseStatus(value.status),
        createdAt: optionalString(value.createdAt, 'createdAt'),
    }
}

function parseStatusEvent(value: unknown): NoteStatusEvent {
    if (!isRecord(value)) throw new NoteApiError('protocol', 'invalid note status event')
    return {
        noteId: requiredString(value.noteId, 'noteId'),
        status: parseStatus(value.status),
        updatedAt: optionalString(value.updatedAt, 'updatedAt'),
        updating: optionalFlag(value.updating, 'updating'),
    }
}

async function fetchNotes(path: string, init?: RequestInit): Promise<Response> {
    try {
        return await authFetch(path, init)
    } catch (error) {
        if (error instanceof AuthRequiredError || isAbortError(error)) throw error
        throw new NoteApiError('transport', 'note service is unavailable', undefined, {cause: error})
    }
}

async function requireOk(response: Response, operation: string): Promise<void> {
    if (response.ok) return
    throw new NoteApiError('http', `${operation} failed (${response.status})`, response.status, undefined,
        await errorCode(response))
}

/** The `code` of the service's error body; undefined for an empty or non-JSON body (a proxy error page). */
async function errorCode(response: Response): Promise<string | undefined> {
    try {
        const body: unknown = await response.json()
        return isRecord(body) && typeof body.code === 'string' ? body.code : undefined
    } catch {
        return undefined
    }
}

async function responseJson(response: Response): Promise<unknown> {
    try {
        return await response.json()
    } catch (error) {
        throw new NoteApiError('protocol', 'note service returned invalid JSON', undefined, {cause: error})
    }
}

const notesListeners = new Set<() => void>()

/** Subscribe note-list views (Notes screen, side panel) to note mutations made by this client. */
export function subscribeToNotesChanges(listener: () => void): () => void {
    notesListeners.add(listener)
    return () => notesListeners.delete(listener)
}

/** Re-fetch note-list views after a note is created, finished, renamed, or deleted. */
export function notifyNotesChanged() {
    notesListeners.forEach((listener) => listener())
}

/** Creates the chat's first note, or with [updateNoteId] appends to its current note. */
export async function requestChatSummary(
    chatId: string,
    idempotencyKey: string,
    updateNoteId?: string,
): Promise<ChatSummaryResponse> {
    const init: RequestInit = updateNoteId
        ? {
            method: 'POST',
            headers: {'Idempotency-Key': idempotencyKey, 'Content-Type': 'application/json'},
            body: JSON.stringify({mode: 'UPDATE', targetNoteId: updateNoteId}),
        }
        : {method: 'POST', headers: {'Idempotency-Key': idempotencyKey}}
    const response = await fetchNotes(`/note/chats/${chatId}/summarize`, init)
    await requireOk(response, 'summary request')
    if (response.status !== 202) throw new NoteApiError('protocol', `unexpected summary status (${response.status})`)
    const summary = parseSummary(await responseJson(response))
    const matches = updateNoteId ? summary.noteId === updateNoteId : summary.status === 'GENERATING'
    if (summary.chatId !== chatId || !matches) {
        throw new NoteApiError('protocol', 'summary response does not match the request')
    }
    return summary
}

export async function listNotes(signal?: AbortSignal): Promise<Note[]> {
    const response = await fetchNotes('/note/notes', {signal})
    await requireOk(response, 'note list fetch')
    const value = await responseJson(response)
    if (!Array.isArray(value)) throw new NoteApiError('protocol', 'invalid note list response')
    return value.map(parseNote)
}

/** The notes written from a chat, newest first. */
export async function listChatNotes(chatId: string, signal?: AbortSignal): Promise<Note[]> {
    const response = await fetchNotes(`/note/chats/${chatId}/notes`, {signal})
    await requireOk(response, 'chat notes fetch')
    const value = await responseJson(response)
    if (!Array.isArray(value)) throw new NoteApiError('protocol', 'invalid chat notes response')
    return value.map(parseNote)
}

export async function getNote(noteId: string, signal?: AbortSignal): Promise<Note> {
    const response = await fetchNotes(`/note/notes/${noteId}`, {signal})
    await requireOk(response, 'note fetch')
    const note = parseNote(await responseJson(response))
    if (note.id !== noteId) throw new NoteApiError('protocol', 'note response does not match the request')
    return note
}

export async function renameNote(noteId: string, title: string): Promise<Note> {
    const response = await fetchNotes(`/note/notes/${noteId}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title}),
    })
    await requireOk(response, 'note rename')
    const note = parseNote(await responseJson(response))
    if (note.id !== noteId) throw new NoteApiError('protocol', 'note response does not match the request')
    return note
}

/** Saves a user edit made against [edit.version]; a newer stored note fails with code `NOTE_VERSION_CONFLICT`. */
export async function updateNote(noteId: string, edit: NoteEdit): Promise<Note> {
    const response = await fetchNotes(`/note/notes/${noteId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title: edit.title, content: edit.content, version: edit.version}),
    })
    await requireOk(response, 'note save')
    const note = parseNote(await responseJson(response))
    if (note.id !== noteId) throw new NoteApiError('protocol', 'note response does not match the request')
    if (note.version === undefined) throw new NoteApiError('protocol', 'saved note has no version')
    return note
}

export async function deleteNote(noteId: string): Promise<void> {
    const response = await fetchNotes(`/note/notes/${noteId}`, {method: 'DELETE'})
    await requireOk(response, 'note delete')
}

/** Resolves the terminal status, or `null` when the stream ends before one. */
export async function streamNoteStatus(
    noteId: string,
    options: { signal?: AbortSignal; onStatus: (event: NoteStatusEvent) => void },
): Promise<NoteStatus | null> {
    const response = await fetchNotes(`/note/notes/${noteId}/status/stream`, {
        headers: {'Accept': 'text/event-stream, application/json'},
        signal: options.signal,
    })
    await requireOk(response, 'note status stream')
    if (!response.body) throw new NoteApiError('protocol', 'note status stream has no body')

    for await (const frame of parseSseStream(response.body, options.signal)) {
        if (frame.event !== 'status') throw new NoteApiError('protocol', `unexpected note event: ${frame.event}`)
        let value: unknown
        try {
            value = JSON.parse(frame.data)
        } catch (error) {
            throw new NoteApiError('protocol', 'note status event contains invalid JSON', undefined, {cause: error})
        }
        const event = parseStatusEvent(value)
        if (event.noteId !== noteId) throw new NoteApiError('protocol', 'note status event does not match the request')
        options.onStatus(event)
        // A READY note that is still updating keeps the stream open until the update is applied.
        if ((event.status === 'READY' && !event.updating) || event.status === 'FAILED') return event.status
    }
    // Ended without READY/FAILED (server time limit or a cut connection): the caller re-reads and reconnects.
    return null
}
