import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch} from '../auth/apiClient'
import {cancelChatTurn, streamAssistantReply, streamInitialAssistantReply, streamRetriedReply} from './streamChatReply'

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
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/chat-1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                'Idempotency-Key': 'key-1',
            },
            body: JSON.stringify({content: 'Hi'}),
        })
    })

    it('reports assistant activity and ignores activity values it does not know', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event:activity\ndata:SEARCHING_NOTES\n\n',
            'event:activity\ndata:BROWSING_WEB\n\n',
            'event:activity\ndata:THINKING\n\nevent:append\ndata:{"text":"Hi"}\n\nevent:done\ndata:\n\n',
        ]))
        const activities: string[] = []

        await expect(streamAssistantReply('chat-1', 'Hi', 'key-1', {
            onAppendText: vi.fn(),
            onActivity: (activity) => activities.push(activity),
            onTurnId: vi.fn(),
        })).resolves.toBe('done')

        expect(activities).toEqual(['SEARCHING_NOTES', 'THINKING'])
    })

    it('keeps leading spaces and line breaks of JSON append text', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event:append\ndata:{"text":"Hello"}\n\n',
            'event:append\ndata:{"text":" world\\n  code"}\n\nevent:done\ndata:\n\n',
        ]))
        const receivedText: string[] = []

        await expect(streamAssistantReply('chat-1', 'Hi', 'key-1', {
            onAppendText: (text) => receivedText.push(text),
            onTurnId: vi.fn(),
        })).resolves.toBe('done')

        expect(receivedText).toEqual(['Hello', ' world\n  code'])
    })

    it('parses a JSON append event that the network split into several chunks', async () => {
        mockedFetch.mockResolvedValue(sseResponse([
            'event:append\ndata:{"te',
            'xt":" split"}\n',
            '\nevent:done\ndata:\n\n',
        ]))
        const receivedText: string[] = []

        await expect(streamAssistantReply('chat-1', 'Hi', 'key-1', {
            onAppendText: (text) => receivedText.push(text),
            onTurnId: vi.fn(),
        })).resolves.toBe('done')

        expect(receivedText).toEqual([' split'])
    })

    it('captures the turn identity before text and returns pending explicitly', async () => {
        mockedFetch.mockResolvedValue(sseResponse(['event: pending\ndata: 1500\n\n']))
        const onTurnId = vi.fn()
        const onAppendText = vi.fn()
        const onPending = vi.fn()
        await expect(streamAssistantReply('chat-1', 'Hi', 'key-1', {onTurnId, onAppendText, onPending}))
            .resolves.toBe('pending')
        expect(onTurnId).toHaveBeenCalledWith('turn-1')
        expect(onAppendText).not.toHaveBeenCalled()
        expect(onPending).toHaveBeenCalledWith(1500)
    })

    it('captures the backend-created chat identity from the initial response headers', async () => {
        const response = sseResponse(['event: append\ndata: Hello\n\nevent: done\ndata:\n\n'])
        response.headers.set('Chat-Id', 'chat-1')
        mockedFetch.mockResolvedValue(response)
        const calls: string[] = []
        const onChatId = vi.fn()
        const onTurnId = vi.fn()

        await expect(streamInitialAssistantReply('Hi', 'key-1', {
            onChatId: (chatId) => {
                calls.push(`chat:${chatId}`)
                onChatId(chatId)
            },
            onTurnId: (turnId) => {
                calls.push(`turn:${turnId}`)
                onTurnId(turnId)
            },
            onAppendText: (text) => calls.push(`append:${text}`),
        })).resolves.toBe('done')

        expect(onChatId).toHaveBeenCalledWith('chat-1')
        expect(onTurnId).toHaveBeenCalledWith('turn-1')
        expect(calls).toEqual(['chat:chat-1', 'turn:turn-1', 'append:Hello'])
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                'Idempotency-Key': 'key-1',
            },
            body: JSON.stringify({content: 'Hi'}),
        })
    })

    it('rejects an initial response without the backend chat identity', async () => {
        mockedFetch.mockResolvedValue(sseResponse(['event: done\ndata:\n\n']))

        await expect(streamInitialAssistantReply('Hi', 'key-1', {
            onChatId: vi.fn(),
            onTurnId: vi.fn(),
            onAppendText: vi.fn(),
        })).rejects.toThrow('Chat-Id')
    })

    it('does not expose a chat identity when the initial response has no turn identity', async () => {
        const response = new Response('event: done\ndata:\n\n', {
            headers: {'Chat-Id': 'chat-1'},
        })
        mockedFetch.mockResolvedValue(response)
        const onChatId = vi.fn()

        await expect(streamInitialAssistantReply('Hi', 'key-1', {
            onChatId,
            onTurnId: vi.fn(),
            onAppendText: vi.fn(),
        })).rejects.toThrow('Chat-Turn-Id')
        expect(onChatId).not.toHaveBeenCalled()
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

describe('streamRetriedReply', () => {
    beforeEach(() => mockedFetch.mockReset())

    it('asks for the failed reply of the turn to be regenerated, without a key or a body', async () => {
        mockedFetch.mockResolvedValue(sseResponse(['event:append\ndata:{"text":"Again"}\n\nevent:done\ndata:\n\n']))
        const receivedText: string[] = []

        await expect(streamRetriedReply('chat 1', 'turn-1', 'reply-1', {
            onAppendText: (text) => receivedText.push(text),
            onTurnId: vi.fn(),
        })).resolves.toBe('done')

        expect(receivedText).toEqual(['Again'])
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/chat%201/turns/turn-1/retry?messageId=reply-1', {
            method: 'POST',
            headers: {'Accept': 'text/event-stream'},
            body: undefined,
        })
    })
})

describe('streamInitialAssistantReply title', () => {
    beforeEach(() => mockedFetch.mockReset())

    /** A stream the test writes to record by record, so events can come after the call has resolved. */
    function controlledResponse() {
        const encoder = new TextEncoder()
        let controller!: ReadableStreamDefaultController<Uint8Array>
        const body = new ReadableStream<Uint8Array>({start: (c) => { controller = c }})
        const response = new Response(body, {
            status: 200,
            headers: {'Content-Type': 'text/event-stream', 'Chat-Turn-Id': 'turn-1', 'Chat-Id': 'chat-1'},
        })
        return {
            response,
            send: (record: string) => controller.enqueue(encoder.encode(record)),
            close: () => controller.close(),
        }
    }

    const callbacks = () => ({onChatId: vi.fn(), onTurnId: vi.fn(), onAppendText: vi.fn()})

    it('reports a title that comes before the reply ends', async () => {
        const response = sseResponse([
            'event:title\ndata:{"title":"Drop D tuning"}\n\n',
            'event:append\ndata:{"text":"Hi"}\n\nevent:done\ndata:\n\n',
        ])
        response.headers.set('Chat-Id', 'chat-1')
        mockedFetch.mockResolvedValue(response)
        const onTitle = vi.fn()

        await expect(streamInitialAssistantReply('Hi', 'key-1', {...callbacks(), onTitle})).resolves.toBe('done')

        expect(onTitle).toHaveBeenCalledWith('Drop D tuning')
    })

    it('resolves on done without waiting for the title, then reports a title that comes later', async () => {
        const stream = controlledResponse()
        mockedFetch.mockResolvedValue(stream.response)
        const onTitle = vi.fn()

        const outcome = streamInitialAssistantReply('Hi', 'key-1', {...callbacks(), onTitle})
        stream.send('event:append\ndata:{"text":"Hi"}\n\nevent:done\ndata:\n\n')
        await expect(outcome).resolves.toBe('done')
        expect(onTitle).not.toHaveBeenCalled()

        stream.send('event:title\ndata:{"title":"Greeting"}\n\n')
        stream.close()

        await vi.waitFor(() => expect(onTitle).toHaveBeenCalledWith('Greeting'))
    })

    it('keeps reading a late title after the screen aborts its signal', async () => {
        const stream = controlledResponse()
        mockedFetch.mockResolvedValue(stream.response)
        const screen = new AbortController()
        const onTitle = vi.fn()

        const outcome = streamInitialAssistantReply('Hi', 'key-1', {...callbacks(), onTitle, signal: screen.signal})
        stream.send('event:done\ndata:\n\n')
        await expect(outcome).resolves.toBe('done')
        screen.abort()

        stream.send('event:title\ndata:{"title":"Greeting"}\n\n')
        stream.close()

        await vi.waitFor(() => expect(onTitle).toHaveBeenCalledWith('Greeting'))
    })

    it('still aborts the request when the screen leaves before the reply ends', async () => {
        const stream = controlledResponse()
        mockedFetch.mockResolvedValue(stream.response)
        const screen = new AbortController()

        const outcome = streamInitialAssistantReply('Hi', 'key-1', {...callbacks(), onTitle: vi.fn(), signal: screen.signal})
        stream.send('event:append\ndata:{"text":"Hi"}\n\n')
        await vi.waitFor(() => expect(mockedFetch).toHaveBeenCalled())
        screen.abort()

        await expect(outcome).resolves.toBe('error')
    })

    it('ignores a title event whose data is not the expected JSON', async () => {
        const response = sseResponse(['event:title\ndata:Drop D\n\nevent:done\ndata:\n\n'])
        response.headers.set('Chat-Id', 'chat-1')
        mockedFetch.mockResolvedValue(response)
        const onTitle = vi.fn()

        await expect(streamInitialAssistantReply('Hi', 'key-1', {...callbacks(), onTitle})).resolves.toBe('done')

        expect(onTitle).not.toHaveBeenCalled()
    })
})
