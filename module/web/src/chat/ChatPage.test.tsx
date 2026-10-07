import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes, useLocation} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
    type ChatMessage,
    type ChatMessagePage,
    deleteChat,
    getChat,
    getMessages,
    notifyChatListChanged
} from './chatApi'
import {NoteApiError, requestChatSummary} from '../notes/noteApi'
import {
    cancelChatTurn,
    ChatStreamHttpError,
    streamAssistantReply,
    streamInitialAssistantReply,
} from './streamChatReply'
import {clearTokens} from '../auth/tokenStore'
import {ChatPage} from './ChatPage'

vi.mock('./chatApi', () => ({
    getMessages: vi.fn(),
    getChat: vi.fn(),
    renameChat: vi.fn(),
    deleteChat: vi.fn(),
    notifyChatListChanged: vi.fn(),
    subscribeToChatListChanges: vi.fn(() => () => undefined),
    ChatApiError: class ChatApiError extends Error {
        constructor(message: string, public readonly status: number) {
            super(message)
        }
    },
}))
vi.mock('./streamChatReply', () => ({
    streamAssistantReply: vi.fn(),
    streamInitialAssistantReply: vi.fn(),
    cancelChatTurn: vi.fn(),
    ChatStreamHttpError: class ChatStreamHttpError extends Error {
        constructor(public readonly status: number) {
            super(`chat stream request failed (${status})`)
        }
    },
}))
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
const mockedInitialStream = vi.mocked(streamInitialAssistantReply)

function messagePage(
    messages: ChatMessage[],
    nextCursor: string | null = null,
    hasMore = false,
): ChatMessagePage {
    return {messages, nextCursor, hasMore}
}

function renderPage() {
    return render(<MemoryRouter initialEntries={['/chats/chat-1']}><Routes>
        <Route path="/chats/:chatId" element={<ChatPage/>}/>
        <Route path="/chats" element={<div data-testid="chats-route"/>}/>
    </Routes></MemoryRouter>)
}

function RoutePath() {
    return <output data-testid="route-path">{useLocation().pathname}</output>
}

function renderNewPage() {
    return render(<MemoryRouter initialEntries={['/chats/new']}>
        <RoutePath/>
        <Routes>
            <Route path="/chats/new" element={<ChatPage newChat/>}/>
            <Route path="/chats/:chatId" element={<ChatPage/>}/>
        </Routes>
    </MemoryRouter>)
}

describe('ChatPage summary flow', () => {
    beforeEach(() => {
        mockedGetMessages.mockReset()
        mockedSummary.mockReset()
        mockedStream.mockReset()
        mockedInitialStream.mockReset()
        vi.mocked(cancelChatTurn).mockReset().mockResolvedValue(undefined)
        vi.mocked(notifyChatListChanged).mockClear()
        vi.mocked(getChat).mockReset().mockResolvedValue({id: 'chat-1', title: 'Trip', noteCount: 0})
        vi.mocked(deleteChat).mockReset()
        sessionStorage.clear()
        mockedGetMessages.mockResolvedValue(messagePage([
            {id: 'u-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
            {id: 'a-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
        ]))
        mockedSummary.mockResolvedValue({noteId: 'note-1', chatId: 'chat-1', status: 'GENERATING'})
    })

    it('opens an unpersisted empty chat and creates it on the first send', async () => {
        const saved = messagePage([
            {id: 'u-new', turnId: 'turn-new', role: 'USER', status: 'COMPLETE', content: 'First question'},
            {id: 'a-new', turnId: 'turn-new', role: 'ASSISTANT', status: 'COMPLETE', content: 'First answer'},
        ])
        mockedGetMessages.mockResolvedValue(saved)
        mockedInitialStream.mockImplementation(async (content, _key, options) => {
            expect(content).toBe('First question')
            options.onChatId('chat-new')
            options.onTurnId('turn-new')
            return 'done'
        })

        renderNewPage()

        const input = await screen.findByRole('textbox', {name: 'Message'})
        expect(mockedInitialStream).not.toHaveBeenCalled()
        expect(mockedGetMessages).not.toHaveBeenCalled()

        await userEvent.type(input, 'First question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))

        await waitFor(() => expect(mockedInitialStream).toHaveBeenCalledOnce())
        expect(mockedStream).not.toHaveBeenCalled()
        expect(await screen.findByText('First answer')).toBeInTheDocument()
        expect(mockedGetMessages).toHaveBeenCalledWith(
            'chat-new',
            expect.objectContaining({signal: expect.anything()}),
        )
    })

    it('retries initial creation with the same key when the chat id header was lost', async () => {
        mockedInitialStream
            .mockRejectedValueOnce(new Error('connection lost'))
            .mockImplementationOnce(async (_content, _key, options) => {
                options.onChatId('chat-recovered')
                options.onTurnId('turn-recovered')
                return 'done'
            })
        mockedGetMessages.mockResolvedValue(messagePage([
            {
                id: 'u-recovered',
                turnId: 'turn-recovered',
                role: 'USER',
                status: 'COMPLETE',
                content: 'First question',
            },
            {
                id: 'a-recovered',
                turnId: 'turn-recovered',
                role: 'ASSISTANT',
                status: 'COMPLETE',
                content: 'Recovered answer',
            },
        ]))

        renderNewPage()
        await userEvent.type(await screen.findByRole('textbox', {name: 'Message'}), 'First question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))

        await userEvent.click(await screen.findByRole('button', {name: 'Retry'}))
        await waitFor(() => expect(mockedInitialStream).toHaveBeenCalledTimes(2))
        expect(mockedInitialStream.mock.calls[1]?.[1]).toBe(mockedInitialStream.mock.calls[0]?.[1])
        expect(mockedStream).not.toHaveBeenCalled()
        expect(await screen.findByText('Recovered answer')).toBeInTheDocument()
        expect(screen.getByTestId('route-path')).toHaveTextContent('/chats/chat-recovered')
        expect(sessionStorage.getItem('uliss.chat-initial-turn.v1')).toBeNull()
    })

    it('renders initial reply chunks before reconciliation loads persisted history', async () => {
        let finishStream: (() => void) | undefined
        mockedInitialStream.mockImplementation(async (_content, _key, options) => {
            options.onChatId('chat-new')
            options.onTurnId('turn-new')
            options.onAppendText('Live answer')
            await new Promise<void>((resolve) => {
                finishStream = resolve
            })
            return 'done'
        })
        mockedGetMessages.mockResolvedValue(messagePage([
            {id: 'u-new', turnId: 'turn-new', role: 'USER', status: 'COMPLETE', content: 'First question'},
            {id: 'a-new', turnId: 'turn-new', role: 'ASSISTANT', status: 'COMPLETE', content: 'Saved answer'},
        ]))

        renderNewPage()
        await userEvent.type(await screen.findByRole('textbox', {name: 'Message'}), 'First question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))

        expect(await screen.findByText('Live answer')).toBeInTheDocument()
        expect(mockedGetMessages).not.toHaveBeenCalled()
        expect(screen.getByTestId('route-path')).toHaveTextContent('/chats/new')
        expect(sessionStorage.getItem('uliss.chat-initial-turn.v1')).not.toBeNull()
        await act(async () => finishStream?.())
        expect(await screen.findByText('Saved answer')).toBeInTheDocument()
        expect(screen.queryByText('Live answer')).not.toBeInTheDocument()
        expect(screen.getByTestId('route-path')).toHaveTextContent('/chats/chat-new')
        expect(sessionStorage.getItem('uliss.chat-initial-turn.v1')).toBeNull()
    })

    it('starts a turn when the page is served without Web Crypto', async () => {
        const originalCrypto = globalThis.crypto
        Object.defineProperty(globalThis, 'crypto', {configurable: true, value: undefined})
        mockedGetMessages.mockResolvedValueOnce(messagePage([])).mockResolvedValueOnce(messagePage([
            {id: 'u-1', turnId: 'turn-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
            {id: 'a-1', turnId: 'turn-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
        ]))
        mockedStream.mockImplementation(async (_chatId, _content, _idempotencyKey, options) => {
            options.onTurnId('turn-1')
            return 'done'
        })

        try {
            renderPage()
            await userEvent.type(await screen.findByRole('textbox', {name: 'Message'}), 'Question')
            await userEvent.click(screen.getByRole('button', {name: 'Send'}))

            await waitFor(() => expect(mockedStream).toHaveBeenCalledOnce())
            expect(mockedStream.mock.calls[0]?.[2])
                .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
            expect(await screen.findByText('Answer')).toBeInTheDocument()
        } finally {
            Object.defineProperty(globalThis, 'crypto', {configurable: true, value: originalCrypto})
        }
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
        // The chat gained a note, so chat lists refresh their note counts.
        expect(notifyChatListChanged).toHaveBeenCalled()
    })

    it('shows the chat title and an actions button in the header', async () => {
        renderPage()

        expect(await screen.findByText('Trip')).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Actions for Trip'})).toBeInTheDocument()
    })

    it('leaves the chat route after deleting the open chat from its header', async () => {
        vi.mocked(deleteChat).mockResolvedValue(undefined)
        renderPage()

        await userEvent.click(await screen.findByRole('button', {name: 'Actions for Trip'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))

        expect(await screen.findByTestId('chats-route')).toBeInTheDocument()
        expect(deleteChat).toHaveBeenCalledWith('chat-1')
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
            .mockResolvedValueOnce(messagePage([
                {id: 'u-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
                {id: 'a-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
            ]))
            .mockResolvedValueOnce(messagePage([
                {id: 'u-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
                {id: 'a-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
            ]))
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
            .mockResolvedValueOnce(messagePage([
                {id: 'u-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
                {id: 'a-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
            ]))
            .mockResolvedValueOnce(messagePage([
                {id: 'u-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
                {id: 'a-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
                {id: 'u-2', turnId: 'turn-2', role: 'USER', status: 'COMPLETE', content: 'Next question'},
                {id: 'a-2', turnId: 'turn-2', role: 'ASSISTANT', status: 'PARTIAL', content: 'Partial reply'},
            ]))
        mockedStream.mockImplementation(async (_chatId, _content, _idempotencyKey, options) => {
            options.onTurnId('turn-2')
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
        expect(cancelChatTurn).not.toHaveBeenCalled()
    })

    it('reuses the persisted chat idempotency key when reconciliation is retried', async () => {
        mockedGetMessages.mockResolvedValue(messagePage([
            {id: 'u-1', role: 'USER', status: 'COMPLETE', content: 'Question'},
            {id: 'a-1', role: 'ASSISTANT', status: 'COMPLETE', content: 'Answer'},
        ]))
        mockedStream.mockResolvedValue('done')
        renderPage()
        const input = await screen.findByRole('textbox', {name: 'Message'})
        await userEvent.type(input, 'Next question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))

        expect(await screen.findByRole('button', {name: 'Retry'})).toBeEnabled()
        const firstKey = mockedStream.mock.calls[0]?.[2]
        expect(firstKey).toEqual(expect.any(String))
        expect(JSON.parse(sessionStorage.getItem('uliss.chat-turn.v1:chat-1') ?? '{}'))
            .toMatchObject({idempotencyKey: firstKey, content: 'Next question'})

        await userEvent.click(screen.getByRole('button', {name: 'Retry'}))

        await waitFor(() => expect(mockedStream).toHaveBeenCalledTimes(2))
        expect(mockedStream.mock.calls[1]?.[2]).toBe(firstKey)
    })

    it('persists the header before settling and waits for the exact pending turn', async () => {
        let finishHistory!: (history: ChatMessagePage) => void
        mockedGetMessages.mockResolvedValueOnce(messagePage([])).mockImplementationOnce(() => new Promise((resolve) => {
            finishHistory = resolve
        }))
        mockedStream.mockImplementation(async (_chat, _content, _key, options) => {
            options.onTurnId('turn-2')
            return 'pending'
        })
        renderPage()
        await userEvent.type(await screen.findByRole('textbox', {name: 'Message'}), 'same')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))
        expect(await screen.findByText('Saving the reply…')).toBeInTheDocument()
        expect(screen.getByRole('textbox', {name: 'Message'})).toBeDisabled()
        expect(JSON.parse(sessionStorage.getItem('uliss.chat-turn.v1:chat-1') ?? '{}'))
            .toMatchObject({turnId: 'turn-2', content: 'same'})
        await act(async () => finishHistory(messagePage([
            {id: 'u-2', turnId: 'turn-2', role: 'USER', status: 'COMPLETE', content: 'same'},
            {id: 'a-2', turnId: 'turn-2', role: 'ASSISTANT', status: 'COMPLETE', content: 'Saved answer'},
        ])))
        expect(await screen.findByText('Saved answer')).toBeInTheDocument()
        expect(sessionStorage.getItem('uliss.chat-turn.v1:chat-1')).toBeNull()
        expect(mockedStream).toHaveBeenCalledOnce()
    })

    it('recovers a saved turn after reload without replaying generation', async () => {
        sessionStorage.setItem('uliss.chat-turn.v1:chat-1', JSON.stringify({
            idempotencyKey: 'key-2', turnId: 'turn-2', content: 'same',
        }))
        mockedGetMessages.mockResolvedValue(messagePage([
            {id: 'u-2', turnId: 'turn-2', role: 'USER', status: 'COMPLETE', content: 'same'},
            {id: 'a-2', turnId: 'turn-2', role: 'ASSISTANT', status: 'COMPLETE', content: 'Saved answer'},
        ]))
        renderPage()
        expect(await screen.findByText('Saved answer')).toBeInTheDocument()
        expect(screen.getByRole('textbox', {name: 'Message'})).toBeEnabled()
        expect(sessionStorage.getItem('uliss.chat-turn.v1:chat-1')).toBeNull()
        expect(mockedStream).not.toHaveBeenCalled()
    })

    it('does not adopt another turn when the response header was lost', async () => {
        sessionStorage.setItem('uliss.chat-turn.v1:chat-1', JSON.stringify({
            idempotencyKey: 'lost-key', content: 'Question',
        }))
        renderPage()
        expect(await screen.findByRole('button', {name: 'Retry'})).toBeEnabled()
        expect(sessionStorage.getItem('uliss.chat-turn.v1:chat-1')).not.toBeNull()
        mockedStream.mockImplementation(async (_chat, _content, _key, options) => {
            options.onTurnId('turn-recovered')
            return 'done'
        })
        mockedGetMessages.mockResolvedValue(messagePage([
            {id: 'u', turnId: 'turn-recovered', role: 'USER', status: 'COMPLETE', content: 'Question'},
            {id: 'a', turnId: 'turn-recovered', role: 'ASSISTANT', status: 'COMPLETE', content: 'Recovered'},
        ]))
        await userEvent.click(screen.getByRole('button', {name: 'Retry'}))
        expect(await screen.findByText('Recovered')).toBeInTheDocument()
        expect(mockedStream.mock.calls[0]?.[2]).toBe('lost-key')
    })

    it('uses durable cancellation when Stop has no terminal persisted reply', async () => {
        mockedGetMessages.mockResolvedValue(messagePage([]))
        mockedStream.mockImplementation(async (_chat, _content, _key, options) => {
            options.onTurnId('turn-stop')
            await new Promise<void>((_resolve, reject) => options.signal?.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'))
            }, {once: true}))
            return 'done'
        })
        vi.mocked(cancelChatTurn).mockImplementation(async () => {
            mockedGetMessages.mockResolvedValue(messagePage([
                {id: 'u', turnId: 'turn-stop', role: 'USER', status: 'COMPLETE', content: 'Question'},
                {id: 'a', turnId: 'turn-stop', role: 'ASSISTANT', status: 'CANCELED', content: ''},
            ]))
        })
        renderPage()
        await userEvent.type(await screen.findByRole('textbox', {name: 'Message'}), 'Question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))
        await userEvent.click(await screen.findByRole('button', {name: 'Stop generation'}))
        await waitFor(() => expect(cancelChatTurn).toHaveBeenCalledWith('chat-1', 'turn-stop', expect.any(AbortSignal)))
        await waitFor(() => expect(screen.getByRole('textbox', {name: 'Message'})).toBeEnabled())
        expect(sessionStorage.getItem('uliss.chat-turn.v1:chat-1')).toBeNull()
    })

    it.each([400, 404, 409])('clears a definitive chat %i failure and permits a fresh action', async (status) => {
        mockedStream.mockRejectedValue(new ChatStreamHttpError(status))
        renderPage()
        const input = await screen.findByRole('textbox', {name: 'Message'})
        await userEvent.type(input, 'Question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))
        await waitFor(() => expect(input).toBeEnabled())
        expect(sessionStorage.getItem('uliss.chat-turn.v1:chat-1')).toBeNull()
        const oldKey = mockedStream.mock.calls[0]?.[2]
        await userEvent.type(input, 'Question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))
        await waitFor(() => expect(mockedStream).toHaveBeenCalledTimes(2))
        expect(mockedStream.mock.calls[1]?.[2]).not.toBe(oldKey)
    })

    it('restores a requested Stop after reload and cancels without starting a stream', async () => {
        sessionStorage.setItem('uliss.chat-turn.v1:chat-1', JSON.stringify({
            idempotencyKey: 'stop-key', turnId: 'turn-stop', content: 'Question', stopRequested: true,
        }))
        mockedGetMessages.mockResolvedValue(messagePage([
            {id: 'u', turnId: 'turn-stop', role: 'USER', status: 'COMPLETE', content: 'Question'},
        ]))
        vi.mocked(cancelChatTurn).mockImplementation(async () => {
            mockedGetMessages.mockResolvedValue(messagePage([
                {id: 'u', turnId: 'turn-stop', role: 'USER', status: 'COMPLETE', content: 'Question'},
                {id: 'a', turnId: 'turn-stop', role: 'ASSISTANT', status: 'CANCELED', content: ''},
            ]))
        })
        renderPage()
        await waitFor(() => expect(cancelChatTurn).toHaveBeenCalledOnce())
        await waitFor(() => expect(screen.getByRole('textbox', {name: 'Message'})).toBeEnabled())
        expect(mockedStream).not.toHaveBeenCalled()
        expect(sessionStorage.getItem('uliss.chat-turn.v1:chat-1')).toBeNull()
    })

    it('retains Stop before headers arrive and recovers its turn identity on Retry', async () => {
        mockedGetMessages.mockResolvedValue(messagePage([]))
        mockedStream.mockImplementationOnce(async (_chat, _content, _key, options) => {
            await new Promise<void>((_resolve, reject) => options.signal?.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'))
            }, {once: true}))
            return 'done'
        }).mockImplementationOnce(async (_chat, _content, _key, options) => {
            options.onTurnId('recovered-stop')
            expect(options.signal?.aborted).toBe(true)
            throw new DOMException('aborted', 'AbortError')
        })
        vi.mocked(cancelChatTurn).mockImplementation(async () => {
            mockedGetMessages.mockResolvedValue(messagePage([
                {id: 'a', turnId: 'recovered-stop', role: 'ASSISTANT', status: 'CANCELED', content: ''},
            ]))
        })
        renderPage()
        await userEvent.type(await screen.findByRole('textbox', {name: 'Message'}), 'Question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))
        await userEvent.click(await screen.findByRole('button', {name: 'Stop generation'}))
        expect(await screen.findByRole('button', {name: 'Retry'})).toBeEnabled()
        expect(JSON.parse(sessionStorage.getItem('uliss.chat-turn.v1:chat-1') ?? '{}').stopRequested).toBe(true)
        await userEvent.click(screen.getByRole('button', {name: 'Retry'}))
        await waitFor(() => expect(cancelChatTurn)
            .toHaveBeenCalledWith('chat-1', 'recovered-stop', expect.any(AbortSignal)))
        expect(mockedStream.mock.calls[1]?.[2]).toBe(mockedStream.mock.calls[0]?.[2])
        await waitFor(() => expect(screen.getByRole('textbox', {name: 'Message'})).toBeEnabled())
    })

    it('retries a failed durable cancellation without restarting generation', async () => {
        sessionStorage.setItem('uliss.chat-turn.v1:chat-1', JSON.stringify({
            idempotencyKey: 'stop-key', turnId: 'turn-stop', content: 'Question', stopRequested: true,
        }))
        mockedGetMessages.mockResolvedValue(messagePage([]))
        vi.mocked(cancelChatTurn).mockRejectedValueOnce(new Error('connection lost'))
            .mockImplementationOnce(async () => {
                mockedGetMessages.mockResolvedValue(messagePage([
                    {id: 'a', turnId: 'turn-stop', role: 'ASSISTANT', status: 'CANCELED', content: ''},
                ]))
            })
        renderPage()
        await userEvent.click(await screen.findByRole('button', {name: 'Retry'}))
        await waitFor(() => expect(screen.getByRole('textbox', {name: 'Message'})).toBeEnabled())
        expect(cancelChatTurn).toHaveBeenCalledTimes(2)
        expect(mockedStream).not.toHaveBeenCalled()
        expect(sessionStorage.getItem('uliss.chat-turn.v1:chat-1')).toBeNull()
    })

    it('loads sequential older pages once and stops at the beginning', async () => {
        mockedGetMessages
            .mockResolvedValueOnce(messagePage([
                {id: 'm-3', role: 'USER', status: 'COMPLETE', content: 'Third'},
                {id: 'm-4', role: 'ASSISTANT', status: 'COMPLETE', content: 'Fourth'},
            ], 'm-3', true))
            .mockResolvedValueOnce(messagePage([
                {id: 'm-1', role: 'USER', status: 'COMPLETE', content: 'First'},
                {id: 'm-2', role: 'ASSISTANT', status: 'COMPLETE', content: 'Second'},
                {id: 'm-3', role: 'USER', status: 'COMPLETE', content: 'Third'},
            ]))
        const view = renderPage()
        await screen.findByText('Fourth')
        const thread = view.container.querySelector('.message-thread') as HTMLDivElement
        thread.scrollTop = 0

        fireEvent.scroll(thread)

        expect(await screen.findByText('First')).toBeInTheDocument()
        expect(screen.getAllByText('Third')).toHaveLength(1)
        expect(screen.getByText('Beginning of conversation')).toBeInTheDocument()
        fireEvent.scroll(thread)
        expect(mockedGetMessages).toHaveBeenCalledTimes(2)
        expect(mockedGetMessages.mock.calls[1]).toEqual([
            'chat-1', {before: 'm-3', signal: expect.any(AbortSignal)},
        ])
    })

    it('deduplicates an active older request and aborts it when the route changes', async () => {
        let olderSignal: AbortSignal | undefined
        mockedGetMessages
            .mockResolvedValueOnce(messagePage([
                {id: 'm-2', role: 'ASSISTANT', status: 'COMPLETE', content: 'Latest'},
            ], 'm-2', true))
            .mockImplementationOnce((_chatId, options) => {
                olderSignal = options?.signal
                return new Promise(() => undefined)
            })
        const view = renderPage()
        await screen.findByText('Latest')
        const thread = view.container.querySelector('.message-thread') as HTMLDivElement
        thread.scrollTop = 0

        fireEvent.scroll(thread)
        fireEvent.scroll(thread)
        await waitFor(() => expect(mockedGetMessages).toHaveBeenCalledTimes(2))
        await userEvent.click(screen.getByRole('link', {name: '‹ chats'}))

        expect(olderSignal?.aborted).toBe(true)
    })

    it('keeps older messages when reconciliation refreshes overlapping latest-page truth', async () => {
        mockedGetMessages
            .mockResolvedValueOnce(messagePage([
                {id: 'm-3', role: 'USER', status: 'COMPLETE', content: 'Tail question'},
                {id: 'm-4', role: 'ASSISTANT', status: 'COMPLETE', content: 'Old tail answer'},
            ], 'm-3', true))
            .mockResolvedValueOnce(messagePage([
                {id: 'm-1', role: 'USER', status: 'COMPLETE', content: 'Old question'},
                {id: 'm-2', role: 'ASSISTANT', status: 'COMPLETE', content: 'Old answer'},
            ]))
            .mockResolvedValueOnce(messagePage([
                {id: 'm-3', role: 'USER', status: 'COMPLETE', content: 'Tail question'},
                {id: 'm-4', role: 'ASSISTANT', status: 'COMPLETE', content: 'Updated tail answer'},
                {id: 'm-5', turnId: 'turn-new', role: 'USER', status: 'COMPLETE', content: 'New question'},
                {id: 'm-6', turnId: 'turn-new', role: 'ASSISTANT', status: 'COMPLETE', content: 'New answer'},
            ], 'm-3', true))
        mockedStream.mockImplementation(async (_chatId, _content, _key, options) => {
            options.onTurnId('turn-new')
            return 'done'
        })
        const view = renderPage()
        await screen.findByText('Old tail answer')
        const thread = view.container.querySelector('.message-thread') as HTMLDivElement
        thread.scrollTop = 0
        fireEvent.scroll(thread)
        await screen.findByText('Old question')

        await userEvent.type(screen.getByRole('textbox', {name: 'Message'}), 'New question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))

        expect(await screen.findByText('New answer')).toBeInTheDocument()
        expect(screen.getByText('Old question')).toBeInTheDocument()
        expect(screen.getByText('Updated tail answer')).toBeInTheDocument()
        expect(screen.queryByText('Old tail answer')).not.toBeInTheDocument()
        expect(screen.getAllByText('Tail question')).toHaveLength(1)
    })

    it('rebuilds a stale window and resets its cursor when the latest page no longer overlaps', async () => {
        mockedGetMessages
            .mockResolvedValueOnce(messagePage([
                {id: 'm-3', role: 'USER', status: 'COMPLETE', content: 'Previous tail question'},
                {id: 'm-4', role: 'ASSISTANT', status: 'COMPLETE', content: 'Previous tail answer'},
            ], 'm-3', true))
            .mockResolvedValueOnce(messagePage([
                {id: 'm-1', role: 'USER', status: 'COMPLETE', content: 'Loaded old question'},
                {id: 'm-2', role: 'ASSISTANT', status: 'COMPLETE', content: 'Loaded old answer'},
            ]))
            .mockResolvedValueOnce(messagePage([
                {id: 'm-101', role: 'USER', status: 'COMPLETE', content: 'New window start'},
                {id: 'm-102', role: 'ASSISTANT', status: 'COMPLETE', content: 'Another client answer'},
                {id: 'm-103', turnId: 'turn-new', role: 'USER', status: 'COMPLETE', content: 'Current question'},
                {id: 'm-104', turnId: 'turn-new', role: 'ASSISTANT', status: 'COMPLETE', content: 'Current answer'},
            ], 'm-101', true))
            .mockResolvedValueOnce(messagePage([
                {id: 'm-99', role: 'USER', status: 'COMPLETE', content: 'Recovered gap question'},
                {id: 'm-100', role: 'ASSISTANT', status: 'COMPLETE', content: 'Recovered gap answer'},
            ], 'm-99', true))
        mockedStream.mockImplementation(async (_chatId, _content, _key, options) => {
            options.onTurnId('turn-new')
            return 'done'
        })
        const view = renderPage()
        await screen.findByText('Previous tail answer')
        const thread = view.container.querySelector('.message-thread') as HTMLDivElement
        thread.scrollTop = 0
        fireEvent.scroll(thread)
        await screen.findByText('Loaded old question')

        await userEvent.type(screen.getByRole('textbox', {name: 'Message'}), 'Current question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))

        expect(await screen.findByText('Current answer')).toBeInTheDocument()
        expect(screen.queryByText('Previous tail answer')).not.toBeInTheDocument()
        expect(screen.queryByText('Loaded old question')).not.toBeInTheDocument()

        thread.scrollTop = 0
        fireEvent.scroll(thread)
        expect(await screen.findByText('Recovered gap question')).toBeInTheDocument()
        expect(mockedGetMessages.mock.calls[3]).toEqual([
            'chat-1', {before: 'm-101', signal: expect.any(AbortSignal)},
        ])
    })

    it('aborts on unmount without durable cancellation and retains the retry identity', async () => {
        let signal: AbortSignal | undefined
        mockedStream.mockImplementation(async (_chat, _content, _key, options) => {
            signal = options.signal
            options.onTurnId('turn-unmounted')
            await new Promise<void>((_resolve, reject) => signal?.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'))
            }, {once: true}))
            return 'done'
        })
        const page = renderPage()
        await userEvent.type(await screen.findByRole('textbox', {name: 'Message'}), 'Question')
        await userEvent.click(screen.getByRole('button', {name: 'Send'}))
        page.unmount()
        await act(async () => {
        })
        expect(signal?.aborted).toBe(true)
        expect(cancelChatTurn).not.toHaveBeenCalled()
        expect(JSON.parse(sessionStorage.getItem('uliss.chat-turn.v1:chat-1') ?? '{}'))
            .toMatchObject({turnId: 'turn-unmounted'})
    })

    it('clears pending operation identities on authentication reset but keeps preferences', () => {
        sessionStorage.setItem('uliss.tokens', '{}')
        sessionStorage.setItem('uliss.chat-turn.v1:chat-1', '{"turnId":"turn-1"}')
        sessionStorage.setItem('uliss.chat-summary.v1:chat-1', 'key')
        sessionStorage.setItem('preference', 'keep')
        clearTokens()
        expect(sessionStorage.getItem('uliss.tokens')).toBeNull()
        expect(sessionStorage.getItem('uliss.chat-turn.v1:chat-1')).toBeNull()
        expect(sessionStorage.getItem('uliss.chat-summary.v1:chat-1')).toBeNull()
        expect(sessionStorage.getItem('preference')).toBe('keep')
    })
})
