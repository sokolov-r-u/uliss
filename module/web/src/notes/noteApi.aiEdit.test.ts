import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch} from '../auth/apiClient'
import {streamNoteAiEdit} from './noteApi'

vi.mock('../auth/apiClient', () => ({
    authFetch: vi.fn(),
    AuthRequiredError: class AuthRequiredError extends Error {
    },
}))

const mockedFetch = vi.mocked(authFetch)

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

function collect() {
    const chunks: string[] = []
    return {chunks, onText: (text: string) => chunks.push(text)}
}

describe('streamNoteAiEdit', () => {
    beforeEach(() => mockedFetch.mockReset())

    it('posts the command and the editor text and delivers chunks until done', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event:append\ndata:{"text":"## Ti"}\n\n',
            ': keepalive\n\n',
            'event:append\ndata:{"text":"tle\\n\\n body"}\n\n',
            'event:done\ndata:\n\n',
        ]))
        const {chunks, onText} = collect()
        const controller = new AbortController()

        await expect(streamNoteAiEdit('n-1', {instruction: 'Fix', content: 'text'}, {
            signal: controller.signal,
            onText,
        })).resolves.toBe('done')

        // JSON chunks keep leading spaces and line breaks that raw SSE data lines would lose.
        expect(chunks).toEqual(['## Ti', 'tle\n\n body'])
        expect(mockedFetch).toHaveBeenCalledWith('/note/notes/n-1/ai-edit', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Accept': 'text/event-stream, application/json'},
            body: JSON.stringify({instruction: 'Fix', content: 'text'}),
            signal: controller.signal,
        })
    })

    it('resolves error when the model fails mid-stream', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event:append\ndata:{"text":"par"}\n\n',
            'event:error\ndata:FAILED\n\n',
        ]))

        await expect(streamNoteAiEdit('n-1', {instruction: 'Fix', content: 'text'}, collect()))
            .resolves.toBe('error')
    })

    it('resolves error when the stream is cut without a terminal event', async () => {
        mockedFetch.mockResolvedValue(sseResponse(['event:append\ndata:{"text":"par"}\n\n']))

        await expect(streamNoteAiEdit('n-1', {instruction: 'Fix', content: 'text'}, collect()))
            .resolves.toBe('error')
    })

    it('rejects a chunk that is not the JSON text shape as a protocol failure', async () => {
        mockedFetch.mockResolvedValue(sseResponse(['event:append\ndata:plain\n\n', 'event:done\ndata:\n\n']))

        await expect(streamNoteAiEdit('n-1', {instruction: 'Fix', content: 'text'}, collect()))
            .rejects.toMatchObject({kind: 'protocol'})
    })

    it.each([
        [409, 'NOTE_UPDATING'],
        [409, 'NOTE_NOT_READY'],
        [404, undefined],
        [400, undefined],
    ])('turns a %i refusal before the stream into an http failure with code %s', async (status, code) => {
        mockedFetch.mockResolvedValue(new Response(JSON.stringify(code ? {code} : {}), {status}))

        await expect(streamNoteAiEdit('n-1', {instruction: 'Fix', content: 'text'}, collect()))
            .rejects.toMatchObject({kind: 'http', status, code})
    })

    it('reports an unreachable service as a transport failure', async () => {
        mockedFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

        await expect(streamNoteAiEdit('n-1', {instruction: 'Fix', content: 'text'}, collect()))
            .rejects.toMatchObject({kind: 'transport'})
    })

    it('passes an abort through unchanged', async () => {
        mockedFetch.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'))

        await expect(streamNoteAiEdit('n-1', {instruction: 'Fix', content: 'text'}, collect()))
            .rejects.toMatchObject({name: 'AbortError'})
    })
})
