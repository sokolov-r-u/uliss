import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {listNotes} from './noteApi'
import {NotesPage} from './NotesPage'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {...actual, listNotes: vi.fn()}
})

const mockedListNotes = vi.mocked(listNotes)

function renderPage() {
    render(<MemoryRouter initialEntries={['/notes']}><Routes>
        <Route path="/notes" element={<NotesPage/>}/>
        <Route path="/notes/:noteId" element={<p>Opened note</p>}/>
    </Routes></MemoryRouter>)
}

describe('NotesPage runtime states', () => {
    beforeEach(() => mockedListNotes.mockReset())

    it('renders and opens persisted notes in backend order', async () => {
        mockedListNotes.mockResolvedValue([
            {id: 'new', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null},
            {id: 'old', source: 'CHAT_SUMMARY', status: 'FAILED', content: null},
        ])
        renderPage()
        const generating = await screen.findByRole('button', {name: /Generating note/})
        expect(screen.getByRole('button', {name: /Summary failed/})).toBeInTheDocument()
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
})
