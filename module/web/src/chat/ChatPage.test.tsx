import {render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {getMessages, notifyChatListChanged} from './chatApi'
import {NoteApiError, requestChatSummary} from '../notes/noteApi'
import {streamAssistantReply} from './streamChatReply'
import {ChatPage} from './ChatPage'

vi.mock('./chatApi', () => ({
    getMessages: vi.fn(),
    notifyChatListChanged: vi.fn(),
}))
vi.mock('./streamChatReply', () => ({streamAssistantReply: vi.fn()}))
vi.mock('../notes/noteApi', () => ({
    requestChatSummary: vi.fn(),
    NoteApiError: class NoteApiError extends Error {
        constructor(
            public readonly kind: string,
            message: string,
            public readonly status?: number,
        ) {
            super(message)
        }
    },
}))

const mockedGetMessages = vi.mocked(getMessages)
const mockedSummary = vi.mocked(requestChatSummary)
const mockedStream = vi.mocked(streamAssistantReply)

function renderPage() {
    return render(<MemoryRouter initialEntries={['/chats/chat-1']}><Routes>
        <Route path="/chats/:chatId" element={<ChatPage/>}/>
    </Routes></MemoryRouter>)
}

describe('ChatPage summary flow', () => {
    beforeEach(() => {
        mockedGetMessages.mockReset()
        mockedSummary.mockReset()
        mockedStream.mockReset()
        sessionStorage.clear()
        mockedGetMessages.mockResolvedValue([
            {id: 'u-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
            {id: 'a-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
        ])
        mockedSummary.mockResolvedValue({noteId: 'note-1', chatId: 'chat-1', status: 'GENERATING'})
    })

    it('requires confirmation and exposes the accepted note link', async () => {
        renderPage()
        const summarize = await screen.findByRole('button', {name: 'Summarize'})
        await userEvent.click(summarize)
        expect(screen.getByRole('dialog', {name: 'Create a summary note?'})).toBeInTheDocument()
        expect(mockedSummary).not.toHaveBeenCalled()

        await userEvent.click(screen.getByRole('button', {name: 'Create summary'}))
        await waitFor(() => expect(mockedSummary).toHaveBeenCalledWith('chat-1', expect.any(String)))
        expect(await screen.findByRole('status', {name: 'Summary note'}))
            .toHaveTextContent('Uliss is writing a note — summary started')
        expect(await screen.findByRole('link', {name: 'Open note'})).toHaveAttribute('href', '/notes/note-1')
        expect(notifyChatListChanged).not.toHaveBeenCalled()
    })

    it.each([
        new NoteApiError('transport', 'connection lost'),
        new NoteApiError('transport', 'request timed out'),
        new NoteApiError('http', 'summary request failed (500)', 500),
        new NoteApiError('protocol', 'invalid summary response'),
    ])('reuses the summary idempotency key after an ambiguous $kind failure', async (failure) => {
        mockedSummary
            .mockRejectedValueOnce(failure)
            .mockResolvedValueOnce({noteId: 'note-1', chatId: 'chat-1', status: 'GENERATING'})
        renderPage()
        await userEvent.click(await screen.findByRole('button', {name: 'Summarize'}))

        await userEvent.click(screen.getByRole('button', {name: 'Create summary'}))
        expect(await screen.findByText(failure.message)).toBeInTheDocument()
        const firstKey = mockedSummary.mock.calls[0]?.[1]
        expect(sessionStorage.getItem('uliss.chat-summary.v1:chat-1')).toBe(firstKey)

        await userEvent.click(screen.getByRole('button', {name: 'Create summary'}))
        await waitFor(() => expect(mockedSummary).toHaveBeenCalledTimes(2))
        expect(mockedSummary.mock.calls[1]?.[1]).toBe(firstKey)
        expect(sessionStorage.getItem('uliss.chat-summary.v1:chat-1')).toBeNull()
    })

    it('restores the summary idempotency key after a page reload', async () => {
        mockedSummary
            .mockRejectedValueOnce(new NoteApiError('transport', 'connection lost'))
            .mockResolvedValueOnce({noteId: 'note-1', chatId: 'chat-1', status: 'GENERATING'})
        const page = renderPage()
        await userEvent.click(await screen.findByRole('button', {name: 'Summarize'}))
        await userEvent.click(screen.getByRole('button', {name: 'Create summary'}))
        expect(await screen.findByText('connection lost')).toBeInTheDocument()
        const firstKey = mockedSummary.mock.calls[0]?.[1]

        page.unmount()
        renderPage()
        await userEvent.click(await screen.findByRole('button', {name: 'Summarize'}))
        await userEvent.click(screen.getByRole('button', {name: 'Create summary'}))

        await waitFor(() => expect(mockedSummary).toHaveBeenCalledTimes(2))
        expect(mockedSummary.mock.calls[1]?.[1]).toBe(firstKey)
        expect(sessionStorage.getItem('uliss.chat-summary.v1:chat-1')).toBeNull()
    })

    it.each([400, 404, 409])('creates a new key after a definitive %i response', async (status) => {
        mockedSummary
            .mockRejectedValueOnce(new NoteApiError('http', `summary request failed (${status})`, status))
            .mockResolvedValueOnce({noteId: 'note-1', chatId: 'chat-1', status: 'GENERATING'})
        renderPage()
        await userEvent.click(await screen.findByRole('button', {name: 'Summarize'}))

        await userEvent.click(screen.getByRole('button', {name: 'Create summary'}))
        expect(await screen.findByText(`summary request failed (${status})`)).toBeInTheDocument()
        const rejectedKey = mockedSummary.mock.calls[0]?.[1]
        expect(sessionStorage.getItem('uliss.chat-summary.v1:chat-1')).toBeNull()

        await userEvent.click(screen.getByRole('button', {name: 'Create summary'}))
        await waitFor(() => expect(mockedSummary).toHaveBeenCalledTimes(2))
        expect(mockedSummary.mock.calls[1]?.[1]).not.toBe(rejectedKey)
    })

    it('requires reconciliation when a completed stream has no persisted reply', async () => {
        mockedGetMessages
            .mockResolvedValueOnce([
                {id: 'u-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
                {id: 'a-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
            ])
            .mockResolvedValueOnce([
                {id: 'u-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
                {id: 'a-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
            ])
        mockedStream.mockResolvedValue('done')
        renderPage()
        const input = await screen.findByRole('textbox', {name: 'Message'})
        await userEvent.type(input, 'Next question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))

        expect(await screen.findByText(
            'The saved reply could not be confirmed. Retry before sending another message.',
        )).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Retry'})).toBeEnabled()
        expect(input).toBeDisabled()
    })

    it('keeps Stop active until the matching PARTIAL reply is persisted', async () => {
        mockedGetMessages
            .mockResolvedValueOnce([
                {id: 'u-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
                {id: 'a-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
            ])
            .mockResolvedValueOnce([
                {id: 'u-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
                {id: 'a-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
                {id: 'u-2', role: 'USER', status: 'COMPLETE', content: 'Next question'},
                {id: 'a-2', role: 'ASSISTANT', status: 'PARTIAL', content: 'Partial reply'},
            ])
        mockedStream.mockImplementation(async (_chatId, _content, options) => {
            options.onAppendText('Partial')
            await new Promise<void>((_resolve, reject) => options.signal?.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'))
            }, {once: true}))
            return 'done'
        })
        renderPage()
        const input = await screen.findByRole('textbox', {name: 'Message'})
        await userEvent.type(input, 'Next question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))
        await userEvent.click(await screen.findByRole('button', {name: 'Stop generation'}))

        expect(await screen.findByText('Partial reply')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole('textbox', {name: 'Message'})).toBeEnabled())
        expect(screen.getByRole('button', {name: 'Summarize'})).toBeEnabled()
        expect(notifyChatListChanged).toHaveBeenCalledOnce()
    })
})
