import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch} from '../auth/apiClient'
import {getMessages} from './chatApi'

vi.mock('../auth/apiClient', () => ({authFetch: vi.fn()}))

const mockedFetch = vi.mocked(authFetch)

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}

describe('chatApi', () => {
    beforeEach(() => mockedFetch.mockReset())

    it('loads the latest page with the default limit and parses the envelope', async () => {
        const page = {
            messages: [{id: 'm-1', role: 'USER' as const, status: 'COMPLETE' as const, content: 'Hello'}],
            nextCursor: 'cursor-1',
            hasMore: true,
        }
        mockedFetch.mockResolvedValue(jsonResponse(page))

        await expect(getMessages('chat-1')).resolves.toEqual(page)
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/chat-1/messages?limit=50', {signal: undefined})
    })

    it('encodes an older-page cursor and explicit limit', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({messages: [], nextCursor: null, hasMore: false}))
        const controller = new AbortController()

        await getMessages('chat-1', {before: 'cursor/with spaces', limit: 25, signal: controller.signal})

        expect(mockedFetch).toHaveBeenCalledWith(
            '/note/chats/chat-1/messages?limit=25&before=cursor%2Fwith+spaces',
            {signal: controller.signal},
        )
    })

    it('rejects an unsuccessful response', async () => {
        mockedFetch.mockResolvedValue(new Response(null, {status: 404}))

        await expect(getMessages('missing')).rejects.toThrow('chat messages fetch failed (404)')
    })
})
