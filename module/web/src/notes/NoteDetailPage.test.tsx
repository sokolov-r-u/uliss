import {render, screen} from '@testing-library/react'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {getNote, NoteApiError, streamNoteStatus} from './noteApi'
import {NoteDetailPage} from './NoteDetailPage'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {...actual, getNote: vi.fn(), streamNoteStatus: vi.fn()}
})

const mockedGetNote = vi.mocked(getNote)
const mockedStatus = vi.mocked(streamNoteStatus)

function renderPage() {
    render(<MemoryRouter initialEntries={['/notes/note-1']}><Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage/>}/>
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

    it('renders ownership-safe 404 separately from retryable errors', async () => {
        mockedGetNote.mockRejectedValue(new NoteApiError('http', 'note fetch failed (404)', 404))
        renderPage()
        expect(await screen.findByRole('heading', {name: 'Note not found'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Retry'})).not.toBeInTheDocument()
    })
})
