import {render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from '@testing-library/react'
import {deleteNote, listNotes, notifyNotesChanged, renameNote} from './noteApi'
import {NotesPage} from './NotesPage'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {...actual, listNotes: vi.fn(), renameNote: vi.fn(), deleteNote: vi.fn(), listSubNotes: vi.fn(() => Promise.resolve([])),
        listPinnedNotes: vi.fn(() => Promise.resolve([]))}
})

const mockedListNotes = vi.mocked(listNotes)

function renderPage() {
    render(<MemoryRouter initialEntries={['/notes']}><Routes>
        <Route path="/notes" element={<NotesPage/>}/>
        <Route path="/notes/new" element={<p>New note screen</p>}/>
        <Route path="/notes/:noteId" element={<p>Opened note</p>}/>
    </Routes></MemoryRouter>)
}

describe('NotesPage runtime states', () => {
    beforeEach(() => {
        mockedListNotes.mockReset()
        vi.mocked(renameNote).mockReset()
        vi.mocked(deleteNote).mockReset()
    })

    it('renders and opens persisted notes in backend order', async () => {
        mockedListNotes.mockResolvedValue({items: [
            {id: 'fresh', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null},
            {id: 'old', source: 'CHAT_SUMMARY', status: 'FAILED', content: null},
        ], nextCursor: null, total: 2, allTotal: 2})
        renderPage()
        const generating = await screen.findByRole('button', {name: 'Generating note…'})
        expect(screen.getByRole('button', {name: 'Summary failed'})).toBeInTheDocument()
        await userEvent.click(generating)
        expect(await screen.findByText('Opened note')).toBeInTheDocument()
    })

    it('offers an explicit retry after a list failure', async () => {
        mockedListNotes.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({items: [], nextCursor: null, total: 0, allTotal: 0})
        renderPage()
        await userEvent.click(await screen.findByRole('button', {name: 'Retry'}))
        expect(await screen.findByText('Nothing written down yet')).toBeInTheDocument()
        expect(mockedListNotes).toHaveBeenCalledTimes(2)
    })

    it('offers a new note while the list loads and after it fails', async () => {
        mockedListNotes.mockRejectedValueOnce(new Error('offline'))
        renderPage()
        expect(screen.getByRole('button', {name: 'New note'})).toBeInTheDocument()
        await screen.findByRole('button', {name: 'Retry'})

        await userEvent.click(screen.getByRole('button', {name: 'New note'}))

        expect(await screen.findByText('New note screen')).toBeInTheDocument()
    })

    it('renames a ready note in place and removes a deleted one', async () => {
        // The list re-reads the server after each change; the mock answers with the server state at that point.
        mockedListNotes
            .mockResolvedValueOnce({items: [
                {id: 'a', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'Body'},
                {id: 'b', source: 'CHAT_SUMMARY', status: 'READY', title: 'Other', content: 'Body'},
            ], nextCursor: null, total: 2, allTotal: 2})
            .mockResolvedValueOnce({items: [
                {id: 'a', source: 'CHAT_SUMMARY', status: 'READY', title: 'Better idea', content: 'Body'},
                {id: 'b', source: 'CHAT_SUMMARY', status: 'READY', title: 'Other', content: 'Body'},
            ], nextCursor: null, total: 2, allTotal: 2})
            .mockResolvedValue({items: [
                {id: 'a', source: 'CHAT_SUMMARY', status: 'READY', title: 'Better idea', content: 'Body'},
            ], nextCursor: null, total: 1, allTotal: 1})
        vi.mocked(renameNote).mockResolvedValue(
            {id: 'a', source: 'CHAT_SUMMARY', status: 'READY', title: 'Better idea', content: 'Body'})
        vi.mocked(deleteNote).mockResolvedValue(undefined)
        renderPage()

        await userEvent.click(await screen.findByRole('button', {name: 'Actions for Idea'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Rename'}))
        const field = screen.getByRole('textbox')
        await userEvent.clear(field)
        await userEvent.type(field, 'Better idea')
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))
        expect(await screen.findByRole('button', {name: 'Better idea'})).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', {name: 'Actions for Other'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))
        await waitFor(() => expect(screen.queryByRole('button', {name: 'Other'})).not.toBeInTheDocument())
        await waitFor(() => expect(mockedListNotes).toHaveBeenCalledTimes(3))
    })

    it('offers only Delete for a note that is still generating', async () => {
        mockedListNotes.mockResolvedValue({items: [{id: 'w', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null}], nextCursor: null, total: 1, allTotal: 1})
        renderPage()

        await userEvent.click(await screen.findByRole('button', {name: 'Actions for Generating note…'}))

        expect(screen.queryByRole('menuitem', {name: 'Rename'})).not.toBeInTheDocument()
        expect(screen.getByRole('menuitem', {name: 'Delete'})).toBeInTheDocument()
    })

    it('reloads when notes change elsewhere (e.g. the side panel)', async () => {
        mockedListNotes
            .mockResolvedValueOnce({items: [{id: 'a', source: 'CHAT_SUMMARY', status: 'READY', title: 'Old', content: 'x'}], nextCursor: null, total: 1, allTotal: 1})
            .mockResolvedValueOnce({items: [{id: 'a', source: 'CHAT_SUMMARY', status: 'READY', title: 'New', content: 'x'}], nextCursor: null, total: 1, allTotal: 1})
        renderPage()
        await screen.findByRole('button', {name: 'Old'})

        act(() => notifyNotesChanged())

        expect(await screen.findByRole('button', {name: 'New'})).toBeInTheDocument()
    })

    it('counts all the user\'s notes and dates rows by their last change', async () => {
        mockedListNotes.mockResolvedValue({items: [
            {id: 'a', source: 'MANUAL', status: 'READY', title: 'Edited', content: 'Body',
                createdAt: '2026-01-05T09:00:00Z', updatedAt: '2026-06-22T09:00:00Z'},
        ], nextCursor: 'cur-1', total: 42, allTotal: 42})
        renderPage()

        await screen.findByRole('button', {name: /^Edited/})
        expect(screen.getByText('42')).toBeInTheDocument()
        const june = new Date('2026-06-22T09:00:00Z').toLocaleDateString(undefined, {month: 'long', year: 'numeric'})
        expect(screen.getByText(june)).toBeInTheDocument()
    })

    it('counts a note deleted here out of the total', async () => {
        mockedListNotes.mockResolvedValueOnce({items: [
            {id: 'a', source: 'MANUAL', status: 'READY', title: 'Gone', content: 'Body'},
            {id: 'b', source: 'MANUAL', status: 'READY', title: 'Kept', content: 'Body'},
        ], nextCursor: 'cur-1', total: 42, allTotal: 42}).mockReturnValue(new Promise(() => undefined))
        vi.mocked(deleteNote).mockResolvedValue(undefined)
        renderPage()

        await userEvent.click(await screen.findByRole('button', {name: 'Actions for Gone'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))

        await waitFor(() => expect(screen.getByText('41')).toBeInTheDocument())
    })
})
