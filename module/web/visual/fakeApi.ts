/**
 * Test-only stand-in for `src/auth/apiClient.ts` (swapped in by `visual/vite.config.ts`): `authFetch` answers from
 * fixtures by URL, so the harness renders the real `App`. `?data=empty` serves a day-one account;
 * `?onboarding=name|profile` serves pending onboarding steps; `?links=on` links a chat with notes; the
 * constellation tree lives in memory (`constellationsFake.ts`) and is empty with `?data=empty`. Sending a chat message opens a reply stream that reports
 * a notes search and then stays open, so the waiting state can be inspected; it also marks the chat as just active.
 * Summarize creates a generating note in the picked place or under a picked note; `?summary=old` gives chat c1 a note
 * that covers only its first answer, so Summarize offers an update. Notes can move under notes and back, and a note
 * with sub-notes is deleted with a choice, as in the note service. `/note/sky` draws the same notes and tree.
 */
import {CHAT_MESSAGES, CHATS, NOTES} from './fixtures'
import {createConstellationStore} from './constellationsFake'

export class AuthRequiredError extends Error {
    constructor() {
        super('authentication required')
        this.name = 'AuthRequiredError'
    }
}

const params = new URLSearchParams(location.search)
const empty = params.get('data') === 'empty'
// `?links=on` links chat c1 with notes n1, n2 and n3 (a long title); without it the panels show their empty states, as in the snapshots.
const CHAT_NOTE_LINKS: Array<[string, string]> = params.get('links') === 'on' ? [['c1', 'n1'], ['c1', 'n2'], ['c1', 'n3']] : []

function json(body: unknown, status = 200): Response {
    if (status === 204) return new Response(null, {status})
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}

/** Sub-note → parent note; the fixture notes start as top notes. */
const parents = new Map<string, string>()
const childrenOf = (noteId: string) => [...parents].filter(([, parent]) => parent === noteId).map(([child]) => child)
const subtreeOf = (noteId: string): string[] => [noteId, ...childrenOf(noteId).flatMap(subtreeOf)]
const ancestorsOf = (noteId: string): string[] => {
    const parent = parents.get(noteId)
    return parent ? [...ancestorsOf(parent), parent] : []
}
const rootOf = (noteId: string) => ancestorsOf(noteId)[0] ?? noteId
const withParent = <T extends { id: string }>(note: T) => ({...note, parentNoteId: parents.get(note.id) ?? null})
const ref = (noteId: string) => ({id: noteId, title: NOTES.find((note) => note.id === noteId)?.title ?? null})

const constellations = createConstellationStore(empty, subtreeOf)

/** The place answer: parent notes from the top one down, and the top note's places. */
function placeOf(noteId: string) {
    return {ancestors: ancestorsOf(noteId).map(ref), constellations: constellations.placesOf(rootOf(noteId)).body}
}

/** Sub-note moves, search and deletes with a choice, as the note service answers them. */
function hierarchyResponse(path: string, method: string, body: string, search: URLSearchParams): Response | null {
    const notes = empty ? [] : NOTES
    if (path === '/note/notes/search') {
        const needle = (search.get('q') ?? '').trim().toLowerCase()
        const excluded = search.get('exclude') ? subtreeOf(search.get('exclude')!) : []
        return json(notes.filter((note) => needle && note.title?.toLowerCase().includes(needle) && !excluded.includes(note.id))
            .map((note) => {
                const main = constellations.placesOf(rootOf(note.id)).body.find((place) => place.main)
                return {id: note.id, title: note.title, ancestors: ancestorsOf(note.id).map(ref),
                    constellationId: main?.constellationId ?? null}
            }))
    }
    const subNotes = path.match(/^\/note\/notes\/([^/]+)\/sub-notes$/)
    if (subNotes) return json(notes.filter((note) => parents.get(note.id) === subNotes[1]).map(withParent))
    const notePlace = path.match(/^\/note\/notes\/([^/]+)\/place$/)
    if (notePlace) return json(placeOf(notePlace[1]))
    const parent = path.match(/^\/note\/notes\/([^/]+)\/parent$/)
    if (parent && method === 'PUT') {
        const parentNoteId = JSON.parse(body).parentNoteId as string
        if (!notes.some((note) => note.id === parentNoteId)) return json({code: 'PARENT_NOTE_NOT_FOUND'}, 404)
        if (subtreeOf(parent[1]).includes(parentNoteId)) return json({code: 'NOTE_MOVE_CYCLE'}, 409)
        constellations.setPlaces(parent[1], [])
        parents.set(parent[1], parentNoteId)
        return json(placeOf(parent[1]))
    }
    if (parent && method === 'DELETE') {
        if (!parents.has(parent[1])) return json(placeOf(parent[1]))
        const moveTo = search.get('moveTo')
        if (moveTo && constellations.setPlaces(parent[1], [{constellationId: moveTo, main: true}]).status === 404) {
            return json({code: 'CONSTELLATION_NOT_FOUND'}, 404)
        }
        parents.delete(parent[1])
        return json(placeOf(parent[1]))
    }
    const note = path.match(/^\/note\/notes\/([^/]+)$/)
    if (note && method === 'DELETE') {
        const index = NOTES.findIndex((item) => item.id === note[1])
        if (index < 0) return json({}, 404)
        const children = childrenOf(note[1])
        const fate = search.get('subNotes')
        if (children.length > 0 && !fate) return json({code: 'NOTE_HAS_SUB_NOTES'}, 409)
        const gone = fate === 'DELETE' ? subtreeOf(note[1]) : [note[1]]
        if (fate === 'KEEP') {
            const grandparent = parents.get(note[1])
            const copied = constellations.placesOf(note[1]).body
            children.forEach((child) => {
                if (grandparent) parents.set(child, grandparent)
                else {
                    parents.delete(child)
                    constellations.setPlaces(child, copied)
                }
            })
        }
        gone.forEach((id) => {
            constellations.setPlaces(id, [])
            parents.delete(id)
            NOTES.splice(NOTES.findIndex((item) => item.id === id), 1)
        })
        return json(null, 204)
    }
    return null
}

/** Chat id → its current summary note, as the latest message page reports it. */
const summaries = new Map<string, { throughMessageId: string; noteId: string; noteTitle: string }>(
    params.get('summary') === 'old' ? [['c1', {throughMessageId: 'm2', noteId: 'n1', noteTitle: 'The empty room'}]] : [])

/** Starts a summary like the service: a new note is generating at once, in the picked place if any. */
function summarize(chatId: string, body: string): Response {
    // Fails once when asked to, so a dialog's error state can be checked
    if (sessionStorage.getItem('visual.summary') === 'fail-once') {
        sessionStorage.removeItem('visual.summary')
        return json({}, 503)
    }
    const request = body
        ? JSON.parse(body) as {
            mode: string; targetNoteId?: string; constellationId?: string; parentNoteId?: string; title?: string
        }
        : null
    if (request?.mode === 'UPDATE') return json({noteId: request.targetNoteId, chatId, status: 'READY'}, 202)
    const noteId = `summary-${chatId}`
    if (request?.constellationId && constellations.addPlace(noteId, request.constellationId).status === 404) {
        return json({code: 'CONSTELLATION_NOT_FOUND'}, 404)
    }
    if (request?.parentNoteId) {
        if (!NOTES.some((note) => note.id === request.parentNoteId)) return json({code: 'PARENT_NOTE_NOT_FOUND'}, 404)
        parents.set(noteId, request.parentNoteId)
    }
    // the user's name, else the chat title standing in for the model's
    const title = request?.title ?? CHATS.find((item) => item.id === chatId)?.title ?? 'Summary'
    NOTES.unshift({id: noteId, source: 'CHAT_SUMMARY', status: 'GENERATING', title, content: null,
        createdAt: '2026-06-24T11:30:00Z'})
    const messages = CHAT_MESSAGES[chatId] ?? []
    summaries.set(chatId, {throughMessageId: messages[messages.length - 1]?.id ?? '', noteId, noteTitle: title})
    return json({noteId, chatId, status: 'GENERATING'}, 202)
}

function constellationResponse(path: string, method: string, body: string, search: URLSearchParams): Response | null {
    const answer = (result: { status: number; body: unknown }) => json(result.body, result.status)
    if (path === '/note/constellations') {
        if (method === 'POST') return answer(constellations.create(JSON.parse(body)))
        return answer(constellations.list())
    }
    // Note places: the visual notes start without a constellation.
    const notes = empty ? [] : NOTES
    if (path === '/note/sky') {
        // Stars are ready titled notes, oldest first; a top star carries its places (the fixtures nest ready notes only).
        const stars = notes.filter((note) => note.status === 'READY' && note.title)
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
            .map((note) => ({
                id: note.id, title: note.title, parentNoteId: parents.get(note.id) ?? null, createdAt: note.createdAt,
                memberships: parents.has(note.id) ? [] : constellations.placesOf(note.id).body,
            }))
        return json({constellations: constellations.list().body, notes: stars})
    }
    if (path === '/note/notes/without-constellation') {
        const loose = notes.filter((note) => !parents.has(note.id) && !constellations.isPlaced(note.id))
            .flatMap((note) => subtreeOf(note.id))
        return json(notes.filter((note) => loose.includes(note.id)).map(withParent))
    }
    const noteNotes = path.match(/^\/note\/constellations\/([^/]+)\/notes$/)
    if (noteNotes) {
        const ids = constellations.notesIn(noteNotes[1])
        return json(notes.filter((note) => ids.includes(note.id)).map(withParent))
    }
    const deletion = path.match(/^\/note\/constellations\/([^/]+)\/deletion$/)
    if (deletion) return answer(constellations.deletion(deletion[1]))
    const main = path.match(/^\/note\/notes\/([^/]+)\/constellations\/main$/)
    if (main && method === 'PUT') return answer(constellations.makeMain(main[1], JSON.parse(body).constellationId))
    const place = path.match(/^\/note\/notes\/([^/]+)\/constellations\/([^/]+)$/)
    if (place && method === 'DELETE') return answer(constellations.removePlace(place[1], place[2]))
    const notePlaces = path.match(/^\/note\/notes\/([^/]+)\/constellations$/)
    if (notePlaces && method === 'POST') return answer(constellations.addPlace(notePlaces[1], JSON.parse(body).constellationId))
    if (notePlaces) return answer(constellations.placesOf(notePlaces[1]))

    const move = path.match(/^\/note\/constellations\/([^/]+)\/move$/)
    if (move && method === 'POST') return answer(constellations.move(move[1], JSON.parse(body).parentId ?? null))
    const one = path.match(/^\/note\/constellations\/([^/]+)$/)
    if (one && method === 'PATCH') return answer(constellations.update(one[1], JSON.parse(body)))
    if (one && method === 'DELETE') return answer(constellations.remove(one[1], search.get('moveTo')))
    return null
}

function onboarding() {
    const step = params.get('onboarding')
    if (step === 'name') return [{code: 'SET_DISPLAY_NAME', blocking: true, status: 'PENDING'}]
    if (step === 'profile') return [{code: 'COMPLETE_PROFILE', blocking: true, status: 'PENDING'}]
    return []
}

/** The harness session never changes: nothing to refresh and no onboarding refusals. */
export async function refreshSession(): Promise<void> {
}

export function onOnboardingRequired(_listener: () => void): () => void {
    return () => undefined
}

export function tokenRequiresOnboarding(): boolean {
    return false
}

/** An SSE reply that sends `records` and never finishes. */
function openReplyStream(chatId: string, records: string[]): Response {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            records.forEach((record) => controller.enqueue(encoder.encode(record)))
        },
    })
    return new Response(body, {
        status: 200,
        headers: {'Content-Type': 'text/event-stream', 'Chat-Id': chatId, 'Chat-Turn-Id': 'turn-visual'},
    })
}

/** Applies an edit to the in-memory fixture, so a reload of the page within the harness shows it. */
function saveEdit(note: (typeof NOTES)[number], body: string) {
    const edit = JSON.parse(body) as { title: string; content: string }
    note.title = edit.title
    note.content = edit.content
    note.version = (note.version ?? 0) + 1
    return note
}

/** A finished model rewrite: the text gets a heading, sent in two chunks like real tokens. */
function rewriteStream(body: string): Response {
    const {content} = JSON.parse(body) as { content: string }
    const chunks = ['## Tidied\n\n', content]
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            chunks.forEach((text) => controller.enqueue(encoder.encode(`event:append\ndata:${JSON.stringify({text})}\n\n`)))
            controller.enqueue(encoder.encode('event:done\ndata:\n\n'))
            controller.close()
        },
    })
    return new Response(stream, {status: 200, headers: {'Content-Type': 'text/event-stream'}})
}

export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
    const url = new URL(path, location.origin)
    const method = init?.method ?? 'GET'
    const chats = empty ? [] : CHATS
    const notes = empty ? [] : NOTES

    if (url.pathname === '/user/users/me/onboarding') return method === 'GET' ? json(onboarding()) : json({})
    if (url.pathname === '/note/chats') return json(chats)
    if (url.pathname === '/note/notes') return json(notes)
    const hierarchy = hierarchyResponse(url.pathname, method, String(init?.body ?? ''), url.searchParams)
    if (hierarchy) return hierarchy
    const constellation = constellationResponse(url.pathname, method, String(init?.body ?? ''), url.searchParams)
    if (constellation) return constellation

    const chatMessages = url.pathname.match(/^\/note\/chats\/([^/]+)\/messages$/)
    if (chatMessages && method === 'POST') {
        // Like the server, an accepted message lifts its chat in chat lists.
        const active = chats.find((item) => item.id === chatMessages[1])
        if (active) active.updatedAt = '2026-06-24T11:00:00Z'
        return openReplyStream(chatMessages[1], ['event:activity\ndata:SEARCHING_NOTES\n\n'])
    }
    if (chatMessages) {
        return json({messages: CHAT_MESSAGES[chatMessages[1]] ?? [], nextCursor: null, hasMore: false,
            summary: summaries.get(chatMessages[1]) ?? null})
    }
    const summary = url.pathname.match(/^\/note\/chats\/([^/]+)\/summarize$/)
    if (summary && method === 'POST') return summarize(summary[1], String(init?.body ?? ''))

    const chatNotes = url.pathname.match(/^\/note\/chats\/([^/]+)\/notes$/)
    if (chatNotes) {
        const ids = CHAT_NOTE_LINKS.filter(([chatId]) => chatId === chatNotes[1]).map(([, noteId]) => noteId)
        return json(notes.filter((item) => ids.includes(item.id)))
    }
    const noteChats = url.pathname.match(/^\/note\/notes\/([^/]+)\/chats$/)
    if (noteChats) {
        const ids = CHAT_NOTE_LINKS.filter(([, noteId]) => noteId === noteChats[1]).map(([chatId]) => chatId)
        return json(chats.filter((item) => ids.includes(item.id)))
    }

    const chat = url.pathname.match(/^\/note\/chats\/([^/]+)$/)
    if (chat) {
        const found = chats.find((item) => item.id === chat[1])
        return found ? json(found) : json({}, 404)
    }

    if (url.pathname === '/note/speech/settings') return json({maxDurationSeconds: 300})
    if (url.pathname === '/note/speech/transcriptions' && method === 'POST') {
        // Fails once when asked to, so the retry path can be walked; otherwise a fixed dictation.
        if (sessionStorage.getItem('visual.speech') === 'fail-once') {
            sessionStorage.removeItem('visual.speech')
            return json({code: 'TRANSCRIPTION_FAILED'}, 502)
        }
        if (sessionStorage.getItem('visual.speech') === 'long') {
            return json({text: 'A dictated name that runs on well past the fifty character limit'})
        }
        return json({text: 'Dictated by voice'})
    }

    if (/^\/note\/notes\/[^/]+\/ai-edit$/.test(url.pathname) && method === 'POST') {
        return rewriteStream(String(init?.body))
    }

    const note = url.pathname.match(/^\/note\/notes\/([^/]+)$/)
    if (note) {
        if (note[1] === 'error') return json({}, 500)
        const found = NOTES.find((item) => item.id === note[1])
        if (!found) return json({}, 404)
        if (method === 'PUT') return json(saveEdit(found, String(init?.body)))
        return json(withParent(found))
    }
    return json({}, 404)
}
