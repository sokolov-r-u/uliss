import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {parseSseStream} from '../lib/sse'
import {errorCode, isRecord, segment} from '../lib/apiHelpers'
import type {CropFrame, PosterCrop} from '@uliss/design-system'

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
    /** The note this sub-note lives under; absent for a top note. */
    parentNoteId?: string
    /** The user's emoji, shown before the title; absent for none. */
    icon?: string
    /** When the user pinned it; absent for an unpinned note. */
    pinnedAt?: string
    /** The note's poster; absent for none. Only single-note responses carry it, never the lists. */
    poster?: NotePoster
}

/** A note poster: an https link the browser loads, and where its two crop frames sit (absent: centred defaults). */
export interface NotePoster {
    url: string
    crop?: PosterCrop
}

/** [note] with [poster] as its poster; none removes it. */
export function withPoster<T extends Note>(note: T, poster: NotePoster | undefined): T {
    const {poster: _previous, ...rest} = note
    return (poster ? {...rest, poster} : rest) as T
}

/** What happens to the sub-notes of a deleted note. */
export type SubNoteFate = 'KEEP' | 'DELETE'

export interface NoteEdit {
    title: string
    content: string
    /** The note's emoji; null removes it. */
    icon: string | null
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

export function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
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
    const parentNoteId = optionalString(value.parentNoteId, 'parentNoteId')
    const icon = optionalString(value.icon, 'icon')
    const pinnedAt = optionalString(value.pinnedAt, 'pinnedAt')
    const poster = parsePoster(value.poster)
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
        ...(parentNoteId ? {parentNoteId} : {}),
        ...(icon ? {icon} : {}),
        ...(pinnedAt ? {pinnedAt} : {}),
        ...(poster ? {poster} : {}),
    }
}

function parseCropFrame(value: unknown): CropFrame {
    if (!isRecord(value)) throw new NoteApiError('protocol', 'invalid poster crop in note response')
    const number = (field: string) => {
        const n = value[field]
        if (typeof n !== 'number' || !Number.isFinite(n)) {
            throw new NoteApiError('protocol', `invalid poster crop ${field} in note response`)
        }
        return n
    }
    return {x: number('x'), y: number('y'), w: number('w'), h: number('h')}
}

function parsePoster(value: unknown): NotePoster | undefined {
    if (value == null) return undefined
    if (!isRecord(value)) throw new NoteApiError('protocol', 'invalid poster in note response')
    const url = requiredString(value.url, 'poster.url')
    if (value.crop == null) return {url}
    if (!isRecord(value.crop)) throw new NoteApiError('protocol', 'invalid poster crop in note response')
    return {url, crop: {poster: parseCropFrame(value.crop.poster), avatar: parseCropFrame(value.crop.avatar)}}
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

/**
 * Starts a summary: an update of [updateNoteId], or a new note placed in [constellationId] as its main constellation
 * or under [parentNoteId] as its sub-note (a new note without either has no place). A missing constellation fails with
 * code `CONSTELLATION_NOT_FOUND`, a missing parent note with `PARENT_NOTE_NOT_FOUND`.
 */
export async function requestChatSummary(
    chatId: string,
    idempotencyKey: string,
    updateNoteId?: string,
    constellationId?: string,
    parentNoteId?: string,
    /** The user's name for a new note; blank lets the model name it. */
    title?: string,
    /** The user's emoji for a new note; the model never picks one. */
    icon?: string | null,
): Promise<ChatSummaryResponse> {
    const name = {...(title?.trim() ? {title: title.trim()} : {}), ...(icon ? {icon} : {})}
    const place = constellationId ? {constellationId} : parentNoteId ? {parentNoteId} : {}
    const body = updateNoteId
        ? {mode: 'UPDATE', targetNoteId: updateNoteId}
        : Object.keys(name).length + Object.keys(place).length > 0 ? {mode: 'CREATE', ...place, ...name} : null
    const init: RequestInit = body
        ? {
            method: 'POST',
            headers: {'Idempotency-Key': idempotencyKey, 'Content-Type': 'application/json'},
            body: JSON.stringify(body),
        }
        : {method: 'POST', headers: {'Idempotency-Key': idempotencyKey}}
    const response = await fetchNotes(`/note/chats/${segment(chatId)}/summarize`, init)
    await requireOk(response, 'summary request')
    if (response.status !== 202) throw new NoteApiError('protocol', `unexpected summary status (${response.status})`)
    const summary = parseSummary(await responseJson(response))
    const matches = updateNoteId ? summary.noteId === updateNoteId : summary.status === 'GENERATING'
    if (summary.chatId !== chatId || !matches) {
        throw new NoteApiError('protocol', 'summary response does not match the request')
    }
    return summary
}

/** One page of the note list, last changed first, with the size of the list and the number of all the user's notes. */
export interface NotePage {
    items: Note[]
    /** Null on the last page. */
    nextCursor: string | null
    /** The listed notes: the filtered ones under a constellation filter. */
    total: number
    /** All the user's notes, filter or not. */
    allTotal: number
}

/**
 * A page of the user's notes by last change, after [cursor] (from the newest without one). Non-empty
 * [constellationIds] keep the notes of those constellations and their sub-constellations, with all their sub-notes.
 */
export async function listNotes(cursor?: string, signal?: AbortSignal,
                                constellationIds: readonly string[] = []): Promise<NotePage> {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    constellationIds.forEach((id) => params.append('constellationId', id))
    const search = params.toString()
    const query = search ? `?${search}` : ''
    const response = await fetchNotes(`/note/notes${query}`, {signal})
    await requireOk(response, 'note list fetch')
    const value = await responseJson(response)
    if (!isRecord(value) || !Array.isArray(value.items)) throw new NoteApiError('protocol', 'invalid note list response')
    const nextCursor = value.nextCursor ?? null
    if (nextCursor !== null && (typeof nextCursor !== 'string' || nextCursor === '')) {
        throw new NoteApiError('protocol', 'invalid nextCursor in note list response')
    }
    if (typeof value.total !== 'number' || !Number.isInteger(value.total) || value.total < 0) {
        throw new NoteApiError('protocol', 'invalid total in note list response')
    }
    // a server older than the filter sends no allTotal: its list is unfiltered, so total is all of them
    const allTotal = value.allTotal ?? value.total
    if (typeof allTotal !== 'number' || !Number.isInteger(allTotal) || allTotal < 0) {
        throw new NoteApiError('protocol', 'invalid allTotal in note list response')
    }
    return {items: value.items.map(parseNote), nextCursor, total: value.total, allTotal}
}

/** Last change of a note: `updatedAt`, else `createdAt` — what the note list sorts and groups by. */
export function noteChangedAt(note: Note): string | undefined {
    return note.updatedAt ?? note.createdAt
}

/** The notes written from a chat, newest first. */
export async function listChatNotes(chatId: string, signal?: AbortSignal): Promise<Note[]> {
    const response = await fetchNotes(`/note/chats/${segment(chatId)}/notes`, {signal})
    await requireOk(response, 'chat notes fetch')
    const value = await responseJson(response)
    if (!Array.isArray(value)) throw new NoteApiError('protocol', 'invalid chat notes response')
    return value.map(parseNote)
}

/**
 * The notes of a constellation itself (not of its sub-constellations) with all their sub-notes, newest first; nest
 * them by `parentNoteId`.
 */
export async function listConstellationNotes(constellationId: string, signal?: AbortSignal): Promise<Note[]> {
    const response = await fetchNotes(`/note/constellations/${segment(constellationId)}/notes`, {signal})
    await requireOk(response, 'constellation notes fetch')
    const value = await responseJson(response)
    if (!Array.isArray(value)) throw new NoteApiError('protocol', 'invalid constellation notes response')
    return value.map(parseNote)
}

/** The note's direct sub-notes, newest first. */
export async function listSubNotes(noteId: string, signal?: AbortSignal): Promise<Note[]> {
    const response = await fetchNotes(`/note/notes/${segment(noteId)}/sub-notes`, {signal})
    await requireOk(response, 'sub-notes fetch')
    const value = await responseJson(response)
    if (!Array.isArray(value)) throw new NoteApiError('protocol', 'invalid sub-notes response')
    return value.map(parseNote)
}

/** Top notes with no constellation together with all their sub-notes (nest them by `parentNoteId`), newest first. */
export async function listNotesWithoutConstellation(signal?: AbortSignal): Promise<Note[]> {
    const response = await fetchNotes('/note/notes/without-constellation', {signal})
    await requireOk(response, 'unplaced notes fetch')
    const value = await responseJson(response)
    if (!Array.isArray(value)) throw new NoteApiError('protocol', 'invalid unplaced notes response')
    return value.map(parseNote)
}

export async function getNote(noteId: string, signal?: AbortSignal): Promise<Note> {
    const response = await fetchNotes(`/note/notes/${segment(noteId)}`, {signal})
    await requireOk(response, 'note fetch')
    const note = parseNote(await responseJson(response))
    if (note.id !== noteId) throw new NoteApiError('protocol', 'note response does not match the request')
    return note
}

/**
 * "Summarize again": queues a rewrite of a summary note from its whole chat. The returned note is `updating` until the
 * new text replaces the old; a retry with the same [idempotencyKey] queues nothing new.
 */
export async function resummarizeNote(noteId: string, idempotencyKey: string): Promise<Note> {
    const response = await fetchNotes(`/note/notes/${segment(noteId)}/resummarize`, {
        method: 'POST',
        headers: {'Idempotency-Key': idempotencyKey},
    })
    await requireOk(response, 'resummarize request')
    const note = parseNote(await responseJson(response))
    if (note.id !== noteId) throw new NoteApiError('protocol', 'resummarize response does not match the request')
    return note
}

export async function renameNote(noteId: string, title: string): Promise<Note> {
    const response = await fetchNotes(`/note/notes/${segment(noteId)}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title}),
    })
    await requireOk(response, 'note rename')
    const note = parseNote(await responseJson(response))
    if (note.id !== noteId) throw new NoteApiError('protocol', 'note response does not match the request')
    return note
}

/**
 * The user's pinned notes, last pinned first; never more than [PIN_LIMIT]. Non-empty [constellationIds] keep those of
 * the same filter as [listNotes].
 */
export async function listPinnedNotes(signal?: AbortSignal, constellationIds: readonly string[] = []): Promise<Note[]> {
    const params = new URLSearchParams()
    constellationIds.forEach((id) => params.append('constellationId', id))
    const search = params.toString()
    const response = await fetchNotes(`/note/notes/pinned${search ? `?${search}` : ''}`, {signal})
    await requireOk(response, 'pinned notes fetch')
    const value = await responseJson(response)
    if (!Array.isArray(value)) throw new NoteApiError('protocol', 'invalid pinned notes response')
    return value.map(parseNote)
}

/** Pins the note; a full pinned list fails with code `PIN_LIMIT_REACHED`. Pinning a pinned note keeps its place. */
export async function pinNote(noteId: string): Promise<Note> {
    const response = await fetchNotes(`/note/notes/${segment(noteId)}/pin`, {method: 'PUT'})
    await requireOk(response, 'note pin')
    const note = parseNote(await responseJson(response))
    if (note.id !== noteId) throw new NoteApiError('protocol', 'note response does not match the request')
    return note
}

export async function unpinNote(noteId: string): Promise<void> {
    const response = await fetchNotes(`/note/notes/${segment(noteId)}/pin`, {method: 'DELETE'})
    await requireOk(response, 'note unpin')
}

/** Sets the note's poster link; the note's version stays, so an open edit still saves. */
/** Sets the note's poster link and crop frames together; no [crop] stores the centred defaults. */
export async function setNotePoster(noteId: string, url: string, crop?: PosterCrop): Promise<Note> {
    const response = await fetchNotes(`/note/notes/${segment(noteId)}/poster`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(crop ? {url, crop} : {url}),
    })
    await requireOk(response, 'note poster save')
    const note = parseNote(await responseJson(response))
    if (note.id !== noteId) throw new NoteApiError('protocol', 'note response does not match the request')
    return note
}

export async function removeNotePoster(noteId: string): Promise<void> {
    const response = await fetchNotes(`/note/notes/${segment(noteId)}/poster`, {method: 'DELETE'})
    await requireOk(response, 'note poster removal')
}

/** Saves a user edit made against [edit.version]; a newer stored note fails with code `NOTE_VERSION_CONFLICT`. */
export async function updateNote(noteId: string, edit: NoteEdit): Promise<Note> {
    const response = await fetchNotes(`/note/notes/${segment(noteId)}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title: edit.title, content: edit.content, icon: edit.icon, version: edit.version}),
    })
    await requireOk(response, 'note save')
    const note = parseNote(await responseJson(response))
    if (note.id !== noteId) throw new NoteApiError('protocol', 'note response does not match the request')
    if (note.version === undefined) throw new NoteApiError('protocol', 'saved note has no version')
    return note
}

/** A new note's icon, title and text. */
export interface NoteDraft {
    title: string
    content: string
    /** The note's emoji; null for none. */
    icon: string | null
}

/** The create request's key was already used with another body: the note it made is [noteId]. */
export class NoteAlreadyCreatedError extends NoteApiError {
    constructor(public readonly noteId: string) {
        super('http', 'note was already created under this key', 409, undefined, 'IDEMPOTENCY_KEY_REUSED')
        this.name = 'NoteAlreadyCreatedError'
    }
}

/**
 * Creates a hand-written note. A retry must send the same [idempotencyKey]: the same draft returns the same note, and
 * a changed draft fails with [NoteAlreadyCreatedError] naming the note the first request made.
 */
export async function createNote(idempotencyKey: string, draft: NoteDraft): Promise<Note> {
    const response = await fetchNotes('/note/notes', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey},
        body: JSON.stringify({title: draft.title, content: draft.content, icon: draft.icon}),
    })
    if (response.status === 409) {
        const noteId = await reusedKeyNoteId(response)
        if (noteId !== undefined) throw new NoteAlreadyCreatedError(noteId)
    }
    await requireOk(response, 'note create')
    const note = parseNote(await responseJson(response))
    if (note.version === undefined) throw new NoteApiError('protocol', 'created note has no version')
    return note
}

async function reusedKeyNoteId(response: Response): Promise<string | undefined> {
    try {
        const body: unknown = await response.clone().json()
        if (!isRecord(body) || body.code !== 'IDEMPOTENCY_KEY_REUSED' || !isRecord(body.details)) return undefined
        const noteId = body.details.noteId
        return typeof noteId === 'string' && noteId !== '' ? noteId : undefined
    } catch {
        return undefined
    }
}

/**
 * Deletes the note. A note with sub-notes needs [subNotes]: `KEEP` gives them its place, `DELETE` takes them too;
 * without it such a note fails with code `NOTE_HAS_SUB_NOTES`.
 */
export async function deleteNote(noteId: string, subNotes?: SubNoteFate): Promise<void> {
    const query = subNotes ? `?subNotes=${subNotes}` : ''
    const response = await fetchNotes(`/note/notes/${segment(noteId)}${query}`, {method: 'DELETE'})
    await requireOk(response, 'note delete')
}

/** Resolves the terminal status, or `null` when the stream ends before one. */
export async function streamNoteStatus(
    noteId: string,
    options: { signal?: AbortSignal; onStatus: (event: NoteStatusEvent) => void },
): Promise<NoteStatus | null> {
    const response = await fetchNotes(`/note/notes/${segment(noteId)}/status/stream`, {
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

export interface NoteAiEditRequest {
    instruction: string
    /** The text as the editor holds it, unsaved edits included. */
    content: string
}

/** Server limits of a model rewrite request. */
export const AI_EDIT_INSTRUCTION_LIMIT = 1_000
export const AI_EDIT_CONTENT_LIMIT = 30_000

function aiEditChunk(data: string): string {
    let value: unknown
    try {
        value = JSON.parse(data)
    } catch (error) {
        throw new NoteApiError('protocol', 'rewrite chunk contains invalid JSON', undefined, {cause: error})
    }
    if (!isRecord(value) || typeof value.text !== 'string') {
        throw new NoteApiError('protocol', 'invalid rewrite chunk')
    }
    return value.text
}

/**
 * Streams a model rewrite of [request.content] by [request.instruction]; nothing is saved. Resolves `done` after the
 * whole text arrived through [options.onText], `error` when the model failed or the stream was cut. Refusals before
 * the stream (409 `NOTE_UPDATING`, `NOTE_NOT_READY`, 404, 400) throw a `NoteApiError` with the service's code.
 */
export async function streamNoteAiEdit(
    noteId: string,
    request: NoteAiEditRequest,
    options: { signal?: AbortSignal; onText: (text: string) => void },
): Promise<'done' | 'error'> {
    const response = await fetchNotes(`/note/notes/${segment(noteId)}/ai-edit`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Accept': 'text/event-stream, application/json'},
        body: JSON.stringify({instruction: request.instruction, content: request.content}),
        signal: options.signal,
    })
    await requireOk(response, 'note rewrite')
    if (!response.body) throw new NoteApiError('protocol', 'note rewrite stream has no body')

    for await (const frame of parseSseStream(response.body, options.signal)) {
        if (frame.event === 'append') options.onText(aiEditChunk(frame.data))
        else if (frame.event === 'done') return 'done'
        else if (frame.event === 'error') return 'error'
    }
    // Stop cancels the reader, which can end the loop quietly: report the abort, not a cut stream.
    if (options.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    // Cut without a terminal event: the text may be incomplete.
    return 'error'
}
