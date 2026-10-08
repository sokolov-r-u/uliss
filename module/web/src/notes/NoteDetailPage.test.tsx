import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {deleteNote, getNote, NoteApiError, renameNote, streamNoteStatus} from './noteApi'
import {NoteDetailPage} from './NoteDetailPage'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {...actual, getNote: vi.fn(), streamNoteStatus: vi.fn(), renameNote: vi.fn(), deleteNote: vi.fn()}
})

const mockedGetNote = vi.mocked(getNote)
const mockedStatus = vi.mocked(streamNoteStatus)

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
})
