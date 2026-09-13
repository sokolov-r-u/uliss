import {render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {getMessages, notifyChatListChanged} from './chatApi'
import {requestChatSummary} from '../notes/noteApi'
import {streamAssistantReply} from './streamChatReply'
import {ChatPage} from './ChatPage'

vi.mock('./chatApi', () => ({
    getMessages: vi.fn(),
    notifyChatListChanged: vi.fn(),
}))
vi.mock('./streamChatReply', () => ({streamAssistantReply: vi.fn()}))
vi.mock('../notes/noteApi', () => ({requestChatSummary: vi.fn()}))

const mockedGetMessages = vi.mocked(getMessages)
const mockedSummary = vi.mocked(requestChatSummary)
const mockedStream = vi.mocked(streamAssistantReply)

function renderPage() {
    render(<MemoryRouter initialEntries={['/chats/chat-1']}><Routes>
        <Route path="/chats/:chatId" element={<ChatPage/>}/>
    </Routes></MemoryRouter>)
}

describe('ChatPage summary flow', () => {
    beforeEach(() => {
        mockedGetMessages.mockReset()
        mockedSummary.mockReset()
        mockedStream.mockReset()
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
        await waitFor(() => expect(mockedSummary).toHaveBeenCalledWith('chat-1'))
        expect(await screen.findByRole('status', {name: 'Summary note'}))
            .toHaveTextContent('Uliss is writing a note — summary started')
        expect(await screen.findByRole('link', {name: 'Open note'})).toHaveAttribute('href', '/notes/note-1')
        expect(notifyChatListChanged).not.toHaveBeenCalled()
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
            options.onToken('Partial')
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
