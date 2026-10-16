import {render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {deleteNote, getNote, NoteApiError, renameNote, streamNoteStatus} from './noteApi'
import {MAX_STATUS_RECONNECTS, NoteDetailPage} from './NoteDetailPage'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {...actual, getNote: vi.fn(), streamNoteStatus: vi.fn(), renameNote: vi.fn(), deleteNote: vi.fn()}
})

const mockedGetNote = vi.mocked(getNote)
const mockedStatus = vi.mocked(streamNoteStatus)

const generating = {id: 'note-1', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null} as const
const ready = (content: string) => ({id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', content} as const)

function renderPage() {
    render(<MemoryRouter initialEntries={['/notes/note-1']}><Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage/>}/>
        <Route path="/notes" element={<div data-testid="notes-route"/>}/>
    </Routes></MemoryRouter>)
}

describe('NoteDetailPage', () => {
    beforeEach(() => {
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
        expect(deleteNote).toHaveBeenCalledWith('note-1')
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

    it('opens the details panel by default from the tablet breakpoint up', async () => {
        vi.stubGlobal('matchMedia', (query: string) => ({matches: query === '(min-width: 768px)'}))
        mockedGetNote.mockResolvedValue({id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'Body'})
        renderPage()

        expect(await screen.findByRole('complementary', {name: 'This note'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Note details'})).toHaveAttribute('aria-pressed', 'true')
        vi.unstubAllGlobals()
    })
})
