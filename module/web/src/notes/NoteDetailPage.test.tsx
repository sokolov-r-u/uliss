import {act, render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes, useLocation} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {listNoteChats, notifyChatListChanged} from '../chat/chatApi'
import {deleteNote, getNote, NoteApiError, renameNote, streamNoteStatus} from './noteApi'
import {MAX_STATUS_RECONNECTS, NoteDetailPage} from './NoteDetailPage'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {
        ...actual, getNote: vi.fn(), streamNoteStatus: vi.fn(), renameNote: vi.fn(), deleteNote: vi.fn(),
        listSubNotes: vi.fn(() => Promise.resolve([])),
    }
})

vi.mock('../chat/chatApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../chat/chatApi')>()
    return {...actual, listNoteChats: vi.fn()}
})

const mockedGetNote = vi.mocked(getNote)
const mockedNoteChats = vi.mocked(listNoteChats)
const mockedStatus = vi.mocked(streamNoteStatus)

const generating = {id: 'note-1', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null} as const
const ready = (content: string) => ({id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', content} as const)

function renderFromDeleteDialog(state?: unknown) {
    render(<MemoryRouter initialEntries={['/chats?deleteChat=c1&in=list', {pathname: '/notes/note-1', state}]}
                         initialIndex={1}><Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage/>}/>
        <Route path="/chats" element={<ChatsSearch/>}/>
    </Routes></MemoryRouter>)
}

function ChatsSearch() {
    return <div data-testid="chats-route">{useLocation().search}</div>
}

function renderPage() {
    render(<MemoryRouter initialEntries={['/notes/note-1']}><Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage/>}/>
        <Route path="/notes" element={<div data-testid="notes-route"/>}/>
        <Route path="/chats/:chatId" element={<div data-testid="chat-route"/>}/>
    </Routes></MemoryRouter>)
}

describe('NoteDetailPage', () => {
    beforeEach(() => {
        mockedNoteChats.mockReset().mockResolvedValue([])
        mockedGetNote.mockReset()
        mockedStatus.mockReset()
    })

    it('refetches JSON after READY instead of taking content from SSE', async () => {
        mockedGetNote
            .mockResolvedValueOnce({id: 'note-1', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null})
            .mockResolvedValueOnce({
                id: 'note-1',
                source: 'CHAT_SUMMARY',
                status: 'READY',
                content: 'Persisted content'
            })
        mockedStatus.mockImplementation(async (_noteId, options) => {
            options.onStatus({noteId: 'note-1', status: 'READY'})
            return 'READY'
        })

        renderPage()
        expect(await screen.findByText('Persisted content')).toBeInTheDocument()
        expect(mockedGetNote).toHaveBeenCalledTimes(2)
    })

    it('shows the current content with a notice while the note updates, then the updated content', async () => {
        mockedGetNote
            .mockResolvedValueOnce({...ready('Old content'), updating: true})
            .mockResolvedValueOnce(ready('Old content\n\n---\n\n## 2026-10-16\n\nNew thought'))
        let finishUpdate: (status: 'READY') => void = () => undefined
        mockedStatus.mockImplementation(() => new Promise((resolve) => {
            finishUpdate = resolve
        }))

        renderPage()

        expect(await screen.findByText('Old content')).toBeInTheDocument()
        expect(screen.getByRole('status')).toHaveTextContent('Updating this note…')
        finishUpdate('READY')
        expect(await screen.findByText('New thought')).toBeInTheDocument()
        expect(screen.queryByText('Updating this note…')).not.toBeInTheDocument()
    })

    it('drops the update notice and keeps the content when the update adds nothing', async () => {
        mockedGetNote
            .mockResolvedValueOnce({...ready('Unchanged'), updating: true})
            .mockResolvedValueOnce(ready('Unchanged'))
        mockedStatus.mockResolvedValueOnce('READY')

        renderPage()

        await waitFor(() => expect(mockedGetNote).toHaveBeenCalledTimes(2))
        expect(screen.getByText('Unchanged')).toBeInTheDocument()
        expect(screen.queryByText('Updating this note…')).not.toBeInTheDocument()
    })

    it('shows no update notice for a settled note and does not subscribe', async () => {
        mockedGetNote.mockResolvedValueOnce(ready('Settled'))

        renderPage()

        expect(await screen.findByText('Settled')).toBeInTheDocument()
        expect(screen.queryByText('Updating this note…')).not.toBeInTheDocument()
        expect(mockedStatus).not.toHaveBeenCalled()
    })

    it('reconnects when the status stream ends while the note is still generating', async () => {
        mockedGetNote
            .mockResolvedValueOnce(generating)
            .mockResolvedValueOnce(generating)
            .mockResolvedValueOnce(ready('After reconnect'))
        mockedStatus.mockResolvedValueOnce(null).mockResolvedValueOnce('READY')

        renderPage()

        expect(await screen.findByText('After reconnect')).toBeInTheDocument()
        expect(mockedStatus).toHaveBeenCalledTimes(2)
    })

    it('shows a note that became ready while the stream was closed, without reconnecting', async () => {
        mockedGetNote.mockResolvedValueOnce(generating).mockResolvedValueOnce(ready('Finished meanwhile'))
        mockedStatus.mockResolvedValueOnce(null)

        renderPage()

        expect(await screen.findByText('Finished meanwhile')).toBeInTheDocument()
        expect(mockedStatus).toHaveBeenCalledTimes(1)
    })

    it('shows a note that failed while the stream was closed', async () => {
        mockedGetNote
            .mockResolvedValueOnce(generating)
            .mockResolvedValueOnce({...generating, status: 'FAILED'})
        mockedStatus.mockResolvedValueOnce(null)

        renderPage()

        expect(await screen.findByText('Summary failed')).toBeInTheDocument()
        expect(mockedStatus).toHaveBeenCalledTimes(1)
    })

    it('gives up with a retryable error when the stream keeps ending without progress', async () => {
        // guards against a tight reconnect loop if the service closes every stream immediately
        mockedGetNote.mockResolvedValue(generating)
        mockedStatus.mockResolvedValue(null)

        renderPage()

        expect(await screen.findByText(/still being written/i)).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Retry'})).toBeInTheDocument()
        expect(mockedStatus).toHaveBeenCalledTimes(MAX_STATUS_RECONNECTS + 1)
    })

    it('keeps an updating note readable when the stream keeps ending without progress', async () => {
        mockedGetNote.mockResolvedValue({...ready('Still readable'), updating: true})
        mockedStatus.mockResolvedValue(null)

        renderPage()

        await waitFor(() => expect(mockedStatus).toHaveBeenCalledTimes(MAX_STATUS_RECONNECTS + 1))
        expect(screen.getByText('Still readable')).toBeInTheDocument()
        expect(screen.queryByText(/still being written/i)).not.toBeInTheDocument()
    })

    it('keeps watching when another update started before the finished one was re-read', async () => {
        mockedGetNote
            .mockResolvedValueOnce({...ready('First'), updating: true})
            .mockResolvedValueOnce({...ready('Second'), updating: true})
            .mockResolvedValueOnce(ready('Third'))
        mockedStatus.mockResolvedValue('READY')

        renderPage()

        expect(await screen.findByText('Third')).toBeInTheDocument()
        expect(mockedStatus).toHaveBeenCalledTimes(2)
        expect(screen.queryByText('Updating this note…')).not.toBeInTheDocument()
    })

    it('stops reconnecting once the page is left', async () => {
        mockedGetNote.mockResolvedValue(generating)
        let closeStream: (status: null) => void = () => undefined
        mockedStatus.mockImplementation(() => new Promise((resolve) => {
            closeStream = resolve
        }))
        const view = render(<MemoryRouter initialEntries={['/notes/note-1']}><Routes>
            <Route path="/notes/:noteId" element={<NoteDetailPage/>}/>
        </Routes></MemoryRouter>)
        await waitFor(() => expect(mockedStatus).toHaveBeenCalledTimes(1))

        view.unmount()
        closeStream(null)
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(mockedGetNote).toHaveBeenCalledTimes(1)
        expect(mockedStatus).toHaveBeenCalledTimes(1)
    })

    it('renders the stored title above the content', async () => {
        mockedGetNote.mockResolvedValue({
            id: 'note-1',
            source: 'CHAT_SUMMARY',
            status: 'READY',
            title: 'Ownership columns',
            content: 'Keep user_id on every table',
        })

        renderPage()

        expect(await screen.findByRole('heading', {name: 'Ownership columns'})).toBeInTheDocument()
        expect(screen.getByText('Keep user_id on every table')).toBeInTheDocument()
    })

    it('renders no title heading for a note without a stored title', async () => {
        mockedGetNote.mockResolvedValue({id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', content: 'Body'})

        renderPage()

        expect(await screen.findByText('Body')).toBeInTheDocument()
        expect(screen.queryByRole('heading', {level: 1})).not.toBeInTheDocument()
    })

    it('renders ownership-safe 404 separately from retryable errors', async () => {
        mockedGetNote.mockRejectedValue(new NoteApiError('http', 'note fetch failed (404)', 404))
        renderPage()
        expect(await screen.findByRole('heading', {name: 'Note not found'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Retry'})).not.toBeInTheDocument()
    })

    it('shows a protocol error when a READY note has no content', async () => {
        mockedGetNote.mockResolvedValue({
            id: 'note-1',
            source: 'CHAT_SUMMARY',
            status: 'READY',
            content: null,
        })

        renderPage()

        expect(await screen.findByRole('heading', {name: 'Could not load the note'})).toBeInTheDocument()
        expect(screen.getByText('ready note content is unavailable')).toBeInTheDocument()
    })

    it('shows a protocol error when refetched note is not READY after the READY event', async () => {
        mockedGetNote
            .mockResolvedValueOnce({id: 'note-1', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null})
            .mockResolvedValueOnce({id: 'note-1', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null})
        mockedStatus.mockResolvedValue('READY')

        renderPage()

        expect(await screen.findByRole('heading', {name: 'Could not load the note'})).toBeInTheDocument()
        expect(screen.getByText('ready note content is unavailable')).toBeInTheDocument()
    })

    it('navigates to the notes list after deleting the open note', async () => {
        mockedGetNote.mockResolvedValue({
            id: 'note-1',
            source: 'CHAT_SUMMARY',
            status: 'READY',
            title: 'Idea',
            content: 'Body'
        })
        vi.mocked(deleteNote).mockResolvedValue(undefined)
        renderPage()

        await userEvent.click(await screen.findByRole('button', {name: 'Actions for Idea'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))

        expect(await screen.findByTestId('notes-route')).toBeInTheDocument()
        expect(deleteNote).toHaveBeenCalledWith('note-1', undefined)
    })

    it('shows the new heading after renaming the open note', async () => {
        mockedGetNote.mockResolvedValue({
            id: 'note-1',
            source: 'CHAT_SUMMARY',
            status: 'READY',
            title: 'Idea',
            content: 'Body'
        })
        vi.mocked(renameNote).mockResolvedValue(
            {id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Better idea', content: 'Body'})
        renderPage()

        await userEvent.click(await screen.findByRole('button', {name: 'Actions for Idea'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Rename'}))
        const field = screen.getByRole('textbox')
        await userEvent.clear(field)
        await userEvent.type(field, 'Better idea')
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))

        expect(await screen.findByRole('heading', {name: 'Better idea'})).toBeInTheDocument()
    })

    it('opens the note details panel from the header', async () => {
        mockedGetNote.mockResolvedValue({
            id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'Body',
            createdAt: '2026-06-22T09:00:00Z', updatedAt: '2026-06-23T09:00:00Z',
        })
        renderPage()

        await userEvent.click(await screen.findByRole('button', {name: 'Note details'}))

        const panel = screen.getByRole('complementary', {name: 'This note'})
        expect(panel).toHaveTextContent('Summary of a chat')
        expect(panel).toHaveTextContent('Written')
        expect(panel).toHaveTextContent('Updated')
    })

    it('lists the chats a summary was written from and opens one', async () => {
        mockedGetNote.mockResolvedValue({id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'Body'})
        mockedNoteChats.mockResolvedValue([
            {id: 'c-2', title: 'Morning ritual', noteCount: 1, updatedAt: '2026-06-23T09:00:00Z'},
            {id: 'c-1', title: 'The small room', noteCount: 2, updatedAt: '2026-06-20T09:00:00Z'},
        ])
        renderPage()

        await userEvent.click(await screen.findByRole('button', {name: 'Note details'}))
        const panel = screen.getByRole('complementary', {name: 'This note'})
        const rows = await within(panel).findAllByRole('button', {name: /Morning ritual|The small room/})
        expect(rows.map((row) => row.textContent)).toEqual([
            expect.stringContaining('Morning ritual'), expect.stringContaining('The small room'),
        ])
        expect(panel).not.toHaveTextContent('Summary of a chat')
        expect(mockedNoteChats).toHaveBeenCalledWith('note-1', expect.any(AbortSignal))

        await userEvent.click(rows[1])
        expect(screen.getByTestId('chat-route')).toBeInTheDocument()
    })

    it('says a note was written by hand when no chat is linked', async () => {
        mockedGetNote.mockResolvedValue({id: 'note-1', source: 'MANUAL', status: 'READY', title: 'Idea', content: 'Body'})
        renderPage()

        await userEvent.click(await screen.findByRole('button', {name: 'Note details'}))

        expect(screen.getByRole('complementary', {name: 'This note'})).toHaveTextContent('Written by hand')
    })

    it('refreshes the source chats when chats change', async () => {
        mockedGetNote.mockResolvedValue({id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'Body'})
        mockedNoteChats
            .mockResolvedValueOnce([{id: 'c-1', title: 'Old title', noteCount: 1}])
            .mockResolvedValue([{id: 'c-1', title: 'New title', noteCount: 1}])
        renderPage()
        await userEvent.click(await screen.findByRole('button', {name: 'Note details'}))
        expect(await screen.findByRole('button', {name: /Old title/})).toBeInTheDocument()

        act(() => notifyChatListChanged())

        expect(await screen.findByRole('button', {name: /New title/})).toBeInTheDocument()
    })

    it('a note opened from the chat delete dialog goes back to it', async () => {
        mockedGetNote.mockResolvedValue({id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'Body'})
        renderFromDeleteDialog({backToDeleteDialog: true})

        await userEvent.click(await screen.findByRole('button', {name: 'Back'}))

        expect(screen.getByTestId('chats-route')).toHaveTextContent('?deleteChat=c1&in=list')
    })

    it('deleting a note opened from the chat delete dialog goes back to the dialog', async () => {
        mockedGetNote.mockResolvedValue({id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'Body'})
        vi.mocked(deleteNote).mockResolvedValue(undefined)
        renderFromDeleteDialog({backToDeleteDialog: true})

        await userEvent.click(await screen.findByRole('button', {name: 'Actions for Idea'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))

        expect(await screen.findByTestId('chats-route')).toHaveTextContent('?deleteChat=c1&in=list')
        expect(deleteNote).toHaveBeenCalledWith('note-1', undefined)
    })

    it('a note opened from another screen of the app goes back to it', async () => {
        mockedGetNote.mockResolvedValue({id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'Body'})
        renderFromDeleteDialog()

        expect(await screen.findByRole('heading', {name: 'Idea'})).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: 'Back'}))

        expect(screen.getByTestId('chats-route')).toBeInTheDocument()
    })

    it('offers no Back on a note opened directly', async () => {
        mockedGetNote.mockResolvedValue({id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'Body'})
        renderPage()

        expect(await screen.findByRole('heading', {name: 'Idea'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Back'})).not.toBeInTheDocument()
    })

    it('opens the details panel by default from the tablet breakpoint up', async () => {
        vi.stubGlobal('matchMedia', (query: string) => ({matches: query === '(min-width: 768px)'}))
        mockedGetNote.mockResolvedValue({id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'Body'})
        renderPage()

        expect(await screen.findByRole('complementary', {name: 'This note'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Note details'})).toHaveAttribute('aria-pressed', 'true')
        vi.unstubAllGlobals()
    })
})
