import {render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {deleteNote, listNotes, renameNote} from './noteApi'
import {NotesPage} from './NotesPage'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {...actual, listNotes: vi.fn(), renameNote: vi.fn(), deleteNote: vi.fn()}
})

const mockedListNotes = vi.mocked(listNotes)

function renderPage() {
    render(<MemoryRouter initialEntries={['/notes']}><Routes>
        <Route path="/notes" element={<NotesPage/>}/>
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
        mockedListNotes.mockResolvedValue([
            {id: 'new', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null},
            {id: 'old', source: 'CHAT_SUMMARY', status: 'FAILED', content: null},
        ])
        renderPage()
        const generating = await screen.findByRole('button', {name: /· Generating note/})
        expect(screen.getByRole('button', {name: /· Summary failed/})).toBeInTheDocument()
        await userEvent.click(generating)
        expect(await screen.findByText('Opened note')).toBeInTheDocument()
    })

    it('offers an explicit retry after a list failure', async () => {
        mockedListNotes.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
        renderPage()
        await userEvent.click(await screen.findByRole('button', {name: 'Retry'}))
        expect(await screen.findByText('Nothing written down yet')).toBeInTheDocument()
        expect(mockedListNotes).toHaveBeenCalledTimes(2)
    })

    it('renames a ready note in place and removes a deleted one', async () => {
        mockedListNotes.mockResolvedValue([
            {id: 'a', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'Body'},
            {id: 'b', source: 'CHAT_SUMMARY', status: 'READY', title: 'Other', content: 'Body'},
        ])
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
        expect(await screen.findByRole('button', {name: /· Better idea/})).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', {name: 'Actions for Other'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))
        await waitFor(() => expect(screen.queryByRole('button', {name: /· Other/})).not.toBeInTheDocument())
        expect(mockedListNotes).toHaveBeenCalledTimes(1)
    })

    it('offers only Delete for a note that is still generating', async () => {
        mockedListNotes.mockResolvedValue([{id: 'w', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null}])
        renderPage()

        await userEvent.click(await screen.findByRole('button', {name: 'Actions for Generating note…'}))

        expect(screen.queryByRole('menuitem', {name: 'Rename'})).not.toBeInTheDocument()
        expect(screen.getByRole('menuitem', {name: 'Delete'})).toBeInTheDocument()
    })
})
