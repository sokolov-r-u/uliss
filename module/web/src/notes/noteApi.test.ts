import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {
    deleteNote,
    getNote,
    listChatNotes,
    listNotes,
    renameNote,
    requestChatSummary,
    streamNoteStatus,
    updateNote,
} from './noteApi'

vi.mock('../auth/apiClient', () => ({
    authFetch: vi.fn(),
    AuthRequiredError: class AuthRequiredError extends Error {
    },
}))

const mockedFetch = vi.mocked(authFetch)

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}

function sseResponse(records: string[]): Response {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            records.forEach((record) => controller.enqueue(encoder.encode(record)))
            controller.close()
        },
    })
    return new Response(body, {status: 200, headers: {'Content-Type': 'text/event-stream'}})
}

describe('noteApi', () => {
    beforeEach(() => mockedFetch.mockReset())

    it('lists the notes of a chat with their statuses', async () => {
        mockedFetch.mockResolvedValue(jsonResponse([
            {id: 'n-2', source: 'CHAT_SUMMARY', status: 'GENERATING', title: null, content: null},
            {id: 'n-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Kept', content: 'Body', updating: true},
        ]))
        const controller = new AbortController()

        const notes = await listChatNotes('chat-1', controller.signal)

        expect(notes.map((note) => [note.id, note.status, note.updating])).toEqual([
            ['n-2', 'GENERATING', false], ['n-1', 'READY', true],
        ])
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/chat-1/notes', {signal: controller.signal})
    })

    it('rejects a chat notes response that is not a list', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({id: 'n-1'}))

        await expect(listChatNotes('chat-1')).rejects.toMatchObject({kind: 'protocol'})
    })

    it('requests a generating summary without a request body', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({
            noteId: 'note-1', chatId: 'chat-1', status: 'GENERATING', createdAt: '2026-09-11T00:00:00Z',
        }, 202))

        await expect(requestChatSummary('chat-1', 'request-1')).resolves.toMatchObject({noteId: 'note-1'})
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/chat-1/summarize', {
            method: 'POST',
            headers: {'Idempotency-Key': 'request-1'},
        })
    })

    it('requests an update of the current note with a JSON body', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({noteId: 'note-1', chatId: 'chat-1', status: 'READY'}, 202))

        await expect(requestChatSummary('chat-1', 'request-1', 'note-1')).resolves.toMatchObject({noteId: 'note-1'})
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/chat-1/summarize', {
            method: 'POST',
            headers: {'Idempotency-Key': 'request-1', 'Content-Type': 'application/json'},
            body: JSON.stringify({mode: 'UPDATE', targetNoteId: 'note-1'}),
        })
    })

    it('creates a placed note with the chosen constellation in a CREATE body', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({noteId: 'note-1', chatId: 'chat-1', status: 'GENERATING'}, 202))

        await expect(requestChatSummary('chat-1', 'request-1', undefined, 'jazz'))
            .resolves.toMatchObject({noteId: 'note-1'})
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/chat-1/summarize', {
            method: 'POST',
            headers: {'Idempotency-Key': 'request-1', 'Content-Type': 'application/json'},
            body: JSON.stringify({mode: 'CREATE', constellationId: 'jazz'}),
        })
    })

    it('carries the error code of a refused placed summary', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({code: 'CONSTELLATION_NOT_FOUND'}, 404))

        await expect(requestChatSummary('chat-1', 'request-1', undefined, 'gone'))
            .rejects.toMatchObject({kind: 'http', status: 404, code: 'CONSTELLATION_NOT_FOUND'})
    })

    it('rejects an update response for another note', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({noteId: 'note-2', chatId: 'chat-1', status: 'READY'}, 202))

        await expect(requestChatSummary('chat-1', 'request-1', 'note-1')).rejects.toMatchObject({kind: 'protocol'})
    })

    it('distinguishes not found from retryable failures', async () => {
        mockedFetch.mockResolvedValue(new Response(null, {status: 404}))
        await expect(getNote('missing')).rejects.toMatchObject({kind: 'http', status: 404})

        mockedFetch.mockRejectedValueOnce(new TypeError('offline'))
        await expect(listNotes()).rejects.toMatchObject({kind: 'transport'})
    })

    it('rejects malformed note payloads', async () => {
        mockedFetch.mockResolvedValue(jsonResponse([{id: 'note-1', source: 'CHAT_SUMMARY', status: 'UNKNOWN'}]))
        await expect(listNotes()).rejects.toMatchObject({kind: 'protocol'})
    })

    it('parses an optional note title', async () => {
        mockedFetch.mockResolvedValue(jsonResponse([
            {id: 'titled', source: 'CHAT_SUMMARY', status: 'READY', title: 'Ownership columns', content: 'Body'},
            {id: 'legacy', source: 'CHAT_SUMMARY', status: 'READY', title: null, content: 'Body'},
        ]))

        const notes = await listNotes()

        expect(notes.map((note) => note.title)).toEqual(['Ownership columns', undefined])
    })

    it('parses a running update and treats its absence as none', async () => {
        mockedFetch.mockResolvedValue(jsonResponse([
            {id: 'updating', source: 'CHAT_SUMMARY', status: 'READY', content: 'Body', updating: true},
            {id: 'settled', source: 'CHAT_SUMMARY', status: 'READY', content: 'Body'},
        ]))

        const notes = await listNotes()

        expect(notes.map((note) => note.updating)).toEqual([true, false])
    })

    it('rejects a non-boolean updating flag', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({
            id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', content: 'Body', updating: 'yes',
        }))
        await expect(getNote('note-1')).rejects.toMatchObject({kind: 'protocol'})
    })

    it('rejects a non-string note title', async () => {
        mockedFetch.mockResolvedValue(jsonResponse([
            {id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 42, content: 'Body'},
        ]))
        await expect(listNotes()).rejects.toMatchObject({kind: 'protocol'})
    })

    it('propagates authentication and abort control flow unchanged', async () => {
        const authError = new AuthRequiredError()
        mockedFetch.mockRejectedValueOnce(authError)
        await expect(listNotes()).rejects.toBe(authError)

        const abort = new DOMException('aborted', 'AbortError')
        mockedFetch.mockRejectedValueOnce(abort)
        await expect(listNotes()).rejects.toBe(abort)
    })

    it('parses status SSE and returns only on a terminal status', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event: status\ndata: {"noteId":"note-1",',
            '"status":"GENERATING"}\n\nevent: status\ndata: {"noteId":"note-1","status":"READY"}\n\n',
        ]))
        const statuses: string[] = []

        await expect(streamNoteStatus('note-1', {onStatus: (event) => statuses.push(event.status)}))
            .resolves.toBe('READY')
        expect(statuses).toEqual(['GENERATING', 'READY'])
        expect(mockedFetch).toHaveBeenCalledWith('/note/notes/note-1/status/stream', expect.objectContaining({
            headers: {'Accept': 'text/event-stream, application/json'},
        }))
    })

    it('keeps reading while a ready note is updating and returns once the update finishes', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event: status\ndata: {"noteId":"note-1","status":"READY","updating":true}\n\n',
            'event: status\ndata: {"noteId":"note-1","status":"READY","updating":false}\n\n',
        ]))
        const updates: (boolean | undefined)[] = []

        await expect(streamNoteStatus('note-1', {onStatus: (event) => updates.push(event.updating)}))
            .resolves.toBe('READY')
        expect(updates).toEqual([true, false])
    })

    it('resolves null when the stream ends before a terminal status, so the caller can reconnect', async () => {
        // the service closes a status stream after a fixed time; proxies may cut it too
        mockedFetch.mockResolvedValue(sseResponse([
            'event: status\ndata: {"noteId":"note-1","status":"GENERATING"}\n\n',
        ]))
        await expect(streamNoteStatus('note-1', {onStatus: () => undefined})).resolves.toBeNull()
    })

    it('ignores heartbeat comments between status events', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            ':keepalive\n\n',
            'event: status\ndata: {"noteId":"note-1","status":"GENERATING"}\n\n',
            ':keepalive\n\n',
            'event: status\ndata: {"noteId":"note-1","status":"READY"}\n\n',
        ]))
        const statuses: string[] = []

        await expect(streamNoteStatus('note-1', {onStatus: (event) => statuses.push(event.status)}))
            .resolves.toBe('READY')
        expect(statuses).toEqual(['GENERATING', 'READY'])
    })

    it('rejects a status event for another note', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event: status\ndata: {"noteId":"other","status":"READY"}\n\n',
        ]))
        await expect(streamNoteStatus('note-1', {onStatus: () => undefined}))
            .rejects.toMatchObject({kind: 'protocol'})
    })

    it('renames a note with a JSON PATCH and validates the response identity', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({
            id: 'n1',
            source: 'CHAT_SUMMARY',
            status: 'READY',
            title: 'New',
            content: 'Body'
        }))
        await expect(renameNote('n1', 'New')).resolves.toMatchObject({title: 'New'})
        expect(mockedFetch).toHaveBeenCalledWith('/note/notes/n1', {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title: 'New'}),
        })

        mockedFetch.mockResolvedValue(jsonResponse({
            id: 'other',
            source: 'CHAT_SUMMARY',
            status: 'READY',
            content: 'Body'
        }))
        await expect(renameNote('n1', 'New')).rejects.toMatchObject({kind: 'protocol'})
    })

    it('reports a failed note delete as an http error with its status', async () => {
        mockedFetch.mockResolvedValue(new Response(null, {status: 404}))

        await expect(deleteNote('n1')).rejects.toMatchObject({kind: 'http', status: 404})
        expect(mockedFetch).toHaveBeenCalledWith('/note/notes/n1', {method: 'DELETE'})
    })

    it('saves an edit with its version and returns the note with the new version', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({
            id: 'n1', source: 'CHAT_SUMMARY', status: 'READY', title: 'New', content: '## Body', version: 4,
        }))

        await expect(updateNote('n1', {title: 'New', content: '## Body', version: 3}))
            .resolves.toMatchObject({title: 'New', content: '## Body', version: 4})
        expect(mockedFetch).toHaveBeenCalledWith('/note/notes/n1', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title: 'New', content: '## Body', version: 3}),
        })
    })

    it('reports why the service refused an edit', async () => {
        for (const code of ['NOTE_VERSION_CONFLICT', 'NOTE_UPDATING', 'NOTE_NOT_READY']) {
            mockedFetch.mockResolvedValue(jsonResponse({status: 409, code, path: '/note/notes/n1'}, 409))

            await expect(updateNote('n1', {title: 'T', content: 'c', version: 1}))
                .rejects.toMatchObject({kind: 'http', status: 409, code})
        }
    })

    it('reports a refusal without a readable body by its status alone', async () => {
        mockedFetch.mockResolvedValue(new Response('<html>bad gateway</html>', {status: 502}))

        const error = await updateNote('n1', {title: 'T', content: 'c', version: 1}).catch((e: unknown) => e)
        expect(error).toMatchObject({kind: 'http', status: 502, code: undefined})
    })

    it('rejects a saved note that is not the edited one or has no version', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({id: 'other', source: 'CHAT_SUMMARY', status: 'READY', content: 'c', version: 1}))
        await expect(updateNote('n1', {title: 'T', content: 'c', version: 0})).rejects.toMatchObject({kind: 'protocol'})

        mockedFetch.mockResolvedValue(jsonResponse({id: 'n1', source: 'CHAT_SUMMARY', status: 'READY', content: 'c'}))
        await expect(updateNote('n1', {title: 'T', content: 'c', version: 0})).rejects.toMatchObject({kind: 'protocol'})
    })

    it('reads the note version and rejects one that is not a number', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({id: 'n1', source: 'CHAT_SUMMARY', status: 'READY', content: 'c', version: 7}))
        await expect(getNote('n1')).resolves.toMatchObject({version: 7})

        mockedFetch.mockResolvedValue(jsonResponse({id: 'n1', source: 'CHAT_SUMMARY', status: 'READY', content: 'c', version: '7'}))
        await expect(getNote('n1')).rejects.toMatchObject({kind: 'protocol'})
    })
})
