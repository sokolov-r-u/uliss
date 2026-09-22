import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch} from '../auth/apiClient'
import {streamAssistantReply} from './streamChatReply'

vi.mock('../auth/apiClient', () => ({authFetch: vi.fn()}))

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

describe('streamAssistantReply', () => {
    beforeEach(() => mockedFetch.mockReset())

    it('appends text from append events until generation completes', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event: append\ndata: Hel\n\n',
            'event: append\ndata: lo\n\nevent: done\ndata:\n\n',
        ]))
        const receivedText: string[] = []

        await expect(streamAssistantReply('chat-1', 'Hi', 'key-1', {
            onAppendText: (text) => receivedText.push(text),
        })).resolves.toBe('done')

        expect(receivedText).toEqual(['Hel', 'lo'])
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/chat-1/messages/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                'Idempotency-Key': 'key-1',
            },
            body: JSON.stringify({content: 'Hi'}),
        })
    })
})
