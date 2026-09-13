import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {getNote, listNotes, requestChatSummary, streamNoteStatus,} from './noteApi'

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

    it('requests a generating summary without a request body', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({
            noteId: 'note-1', chatId: 'chat-1', status: 'GENERATING', createdAt: '2026-09-11T00:00:00Z',
        }, 202))

        await expect(requestChatSummary('chat-1')).resolves.toMatchObject({noteId: 'note-1'})
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/chat-1/summarize', {method: 'POST'})
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

    it('rejects a disconnected non-terminal stream', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event: status\ndata: {"noteId":"note-1","status":"GENERATING"}\n\n',
        ]))
        await expect(streamNoteStatus('note-1', {onStatus: () => undefined}))
            .rejects.toMatchObject({kind: 'protocol'})
    })

    it('rejects a status event for another note', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event: status\ndata: {"noteId":"other","status":"READY"}\n\n',
        ]))
        await expect(streamNoteStatus('note-1', {onStatus: () => undefined}))
            .rejects.toMatchObject({kind: 'protocol'})
    })
})
