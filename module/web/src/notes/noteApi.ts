import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {parseSseStream} from '../lib/sse'

export type NoteStatus = 'GENERATING' | 'READY' | 'FAILED'
export type NoteSource = 'MANUAL' | 'CHAT_SUMMARY'

export interface Note {
    id: string
    source: NoteSource
    status: NoteStatus
    content: string | null
    createdAt?: string
    updatedAt?: string
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
}

export type NoteApiFailureKind = 'http' | 'transport' | 'protocol'

export class NoteApiError extends Error {
    constructor(
        public readonly kind: NoteApiFailureKind,
        message: string,
        public readonly status?: number,
        options?: ErrorOptions,
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
        content: value.content,
        createdAt: optionalString(value.createdAt, 'createdAt'),
        updatedAt: optionalString(value.updatedAt, 'updatedAt'),
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
    throw new NoteApiError('http', `${operation} failed (${response.status})`, response.status)
}

async function responseJson(response: Response): Promise<unknown> {
    try {
        return await response.json()
    } catch (error) {
        throw new NoteApiError('protocol', 'note service returned invalid JSON', undefined, {cause: error})
    }
}

export async function requestChatSummary(chatId: string): Promise<ChatSummaryResponse> {
    const response = await fetchNotes(`/note/chats/${chatId}/summarize`, {method: 'POST'})
    await requireOk(response, 'summary request')
    if (response.status !== 202) throw new NoteApiError('protocol', `unexpected summary status (${response.status})`)
    const summary = parseSummary(await responseJson(response))
    if (summary.chatId !== chatId || summary.status !== 'GENERATING') {
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

export async function getNote(noteId: string, signal?: AbortSignal): Promise<Note> {
    const response = await fetchNotes(`/note/notes/${noteId}`, {signal})
    await requireOk(response, 'note fetch')
    const note = parseNote(await responseJson(response))
    if (note.id !== noteId) throw new NoteApiError('protocol', 'note response does not match the request')
    return note
}

export async function streamNoteStatus(
    noteId: string,
    options: { signal?: AbortSignal; onStatus: (event: NoteStatusEvent) => void },
): Promise<NoteStatus> {
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
        if (event.status === 'READY' || event.status === 'FAILED') return event.status
    }
    throw new NoteApiError('protocol', 'note status stream disconnected before a terminal status')
}
