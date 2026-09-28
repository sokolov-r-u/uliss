import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch} from '../auth/apiClient'
import {cancelChatTurn, streamAssistantReply} from './streamChatReply'

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
    return new Response(body, {
        status: 200, headers: {
            'Content-Type': 'text/event-stream', 'Chat-Turn-Id': 'turn-1',
        }
    })
}

describe('streamAssistantReply', () => {
    beforeEach(() => mockedFetch.mockReset())

    it('appends text from append events until generation completes', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event: append\ndata: Hel\n\n',
            'event: append\ndata: lo\n\nevent: done\ndata:\n\n',
        ]))
        const receivedText: string[] = []
        const onTurnId = vi.fn()

        await expect(streamAssistantReply('chat-1', 'Hi', 'key-1', {
            onAppendText: (text) => receivedText.push(text),
            onTurnId,
        })).resolves.toBe('done')

        expect(receivedText).toEqual(['Hel', 'lo'])
        expect(onTurnId).toHaveBeenCalledWith('turn-1')
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

    it('captures the turn identity before text and returns pending explicitly', async () => {
        mockedFetch.mockResolvedValue(sseResponse(['event: pending\ndata: 1500\n\n']))
        const onTurnId = vi.fn()
        const onAppendText = vi.fn()
        await expect(streamAssistantReply('chat-1', 'Hi', 'key-1', {onTurnId, onAppendText}))
            .resolves.toBe('pending')
        expect(onTurnId).toHaveBeenCalledWith('turn-1')
        expect(onAppendText).not.toHaveBeenCalled()
    })

    it('preserves the identity when the body ends without a terminal event', async () => {
        mockedFetch.mockResolvedValue(sseResponse([]))
        const onTurnId = vi.fn()
        await expect(streamAssistantReply('chat-1', 'Hi', 'key-1', {onTurnId, onAppendText: vi.fn()}))
            .resolves.toBe('error')
        expect(onTurnId).toHaveBeenCalledWith('turn-1')
    })

    it('rejects a response without the backend turn identity', async () => {
        mockedFetch.mockResolvedValue(new Response('event: done\ndata:\n\n'))
        await expect(streamAssistantReply('chat-1', 'Hi', 'key-1', {
            onTurnId: vi.fn(), onAppendText: vi.fn(),
        })).rejects.toThrow('Chat-Turn-Id')
    })

    it('cancels using the internal turn ID through authenticated transport', async () => {
        mockedFetch.mockResolvedValue(new Response(null, {status: 204}))
        const signal = new AbortController().signal
        await cancelChatTurn('chat-1', 'turn-1', signal)
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/chat-1/turns/turn-1/cancel', {
            method: 'POST', signal,
        })
    })

    it('honors Stop from the header callback before consuming tokens', async () => {
        mockedFetch.mockResolvedValue(sseResponse(['event: append\ndata: ignored\n\n']))
        const controller = new AbortController()
        const onAppendText = vi.fn()
        await expect(streamAssistantReply('chat-1', 'Hi', 'key-1', {
            signal: controller.signal,
            onTurnId: () => controller.abort(),
            onAppendText,
        })).rejects.toMatchObject({name: 'AbortError'})
        expect(onAppendText).not.toHaveBeenCalled()
    })
})
