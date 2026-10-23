import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch} from '../auth/apiClient'
import {deleteChat, getChat, getMessages, listChats, listNoteChats, renameChat} from './chatApi'

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

    it('reads the current summary note with its name and icon', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({messages: [], nextCursor: null, hasMore: false,
            summary: {throughMessageId: 'm-1', noteId: 'n-1', noteTitle: 'Giant Steps', noteIcon: '🎷'}}))
        await expect(getMessages('chat-1')).resolves.toMatchObject({
            summary: {throughMessageId: 'm-1', noteId: 'n-1', noteTitle: 'Giant Steps', noteIcon: '🎷'},
        })

        mockedFetch.mockResolvedValue(jsonResponse({messages: [], nextCursor: null, hasMore: false,
            summary: {throughMessageId: 'm-1', noteId: 'n-1', noteTitle: 'Giant Steps'}}))
        await expect(getMessages('chat-1')).resolves.toMatchObject({summary: {noteIcon: null}})
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

    it('lists the chats a note was written from in the server order', async () => {
        const chats = [
            {id: 'c-2', title: 'Active', noteCount: 1, updatedAt: '2026-06-24T10:00:00Z'},
            {id: 'c-1', title: 'Quiet', noteCount: 2, updatedAt: '2026-06-20T10:00:00Z'},
        ]
        mockedFetch.mockResolvedValue(jsonResponse(chats))

        await expect(listNoteChats('note-1')).resolves.toEqual(chats)
        expect(mockedFetch).toHaveBeenCalledWith('/note/notes/note-1/chats', {signal: undefined})
    })

    it('reports a failed note chats request with its status', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({}, 404))

        await expect(listNoteChats('note-1')).rejects.toMatchObject({status: 404})
    })

    it('loads one chat with its note count', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({id: 'c1', title: 'Trip', noteCount: 2}))

        await expect(getChat('c1')).resolves.toMatchObject({title: 'Trip', noteCount: 2})
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/c1', {signal: undefined})
    })

    it('renames a chat with a JSON PATCH and returns the server title', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({id: 'c1', title: 'New', noteCount: 1}))

        await expect(renameChat('c1', 'New')).resolves.toMatchObject({title: 'New', noteCount: 1})
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/c1', {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title: 'New'}),
        })
    })

    it('exposes the HTTP status of a failed chat delete', async () => {
        mockedFetch.mockResolvedValue(new Response(null, {status: 409}))

        await expect(deleteChat('c1')).rejects.toMatchObject({status: 409})
        expect(mockedFetch).toHaveBeenCalledWith('/note/chats/c1', {method: 'DELETE'})
    })

    it('orders chats by last activity (updatedAt, else createdAt), newest first', async () => {
        mockedFetch.mockResolvedValue(jsonResponse([
            {id: 'a', title: 'A', noteCount: 0, createdAt: '2026-06-20T09:00:00Z'},
            {id: 'b', title: 'B', noteCount: 0, createdAt: '2026-05-30T09:00:00Z', updatedAt: '2026-06-22T09:00:00Z'},
            {id: 'c', title: 'C', noteCount: 0, createdAt: '2026-05-10T09:00:00Z'},
        ]))

        expect((await listChats()).map((chat) => chat.id)).toEqual(['b', 'a', 'c'])
    })
})
