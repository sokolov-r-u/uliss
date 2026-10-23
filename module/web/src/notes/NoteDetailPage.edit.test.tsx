import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
    getNote,
    type Note,
    NoteApiError,
    notifyNotesChanged,
    renameNote,
    streamNoteStatus,
    updateNote,
} from './noteApi'
import {NoteDetailPage} from './NoteDetailPage'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {
        ...actual,
        getNote: vi.fn(),
        streamNoteStatus: vi.fn(),
        updateNote: vi.fn(),
        renameNote: vi.fn(),
        notifyNotesChanged: vi.fn(),
    }
})

const mockedGetNote = vi.mocked(getNote)
const mockedUpdate = vi.mocked(updateNote)

const saved: Note = {
    id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'A thought', version: 3,
}

function renderPage() {
    render(<MemoryRouter initialEntries={['/notes/note-1']}><Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage/>}/>
    </Routes></MemoryRouter>)
}

async function startEditing(note: Note = saved) {
    mockedGetNote.mockResolvedValue(note)
    renderPage()
    await userEvent.click(await screen.findByRole('button', {name: 'Edit note'}))
    return {
        title: screen.getByRole('textbox', {name: 'Title'}),
        text: await screen.findByRole('textbox', {name: 'Note text'}),
        save: screen.getByRole('button', {name: 'Save'}),
    }
}

describe('NoteDetailPage editing', () => {
    beforeEach(() => {
        mockedGetNote.mockReset()
        mockedUpdate.mockReset()
        vi.mocked(streamNoteStatus).mockReset()
    })

    it('offers editing only for a settled ready note', async () => {
        mockedGetNote.mockResolvedValue({...saved, updating: true})
        vi.mocked(streamNoteStatus).mockReturnValue(new Promise(() => undefined))
        renderPage()

        expect(await screen.findByRole('button', {name: 'Edit note'})).toBeDisabled()
    })

    it('offers no editing for a note that failed', async () => {
        mockedGetNote.mockResolvedValue({id: 'note-1', source: 'CHAT_SUMMARY', status: 'FAILED', content: null})
        renderPage()

        expect(await screen.findByRole('heading', {name: 'Summary failed'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Edit note'})).not.toBeInTheDocument()
    })

    it('opens the title and text for editing with nothing to save yet', async () => {
        const {title, text, save} = await startEditing()

        expect(title).toHaveValue('Idea')
        expect(text).toHaveTextContent('A thought')
        expect(save).toBeDisabled()
        expect(screen.queryByRole('button', {name: 'Actions for Idea'})).not.toBeInTheDocument()
    })

    it('saves a new title with the stored text unchanged and shows the saved note', async () => {
        mockedUpdate.mockResolvedValue({...saved, title: 'Better idea', version: 4})
        const {title, save} = await startEditing()

        await userEvent.clear(title)
        await userEvent.type(title, 'Better idea')
        await userEvent.click(save)

        expect(mockedUpdate).toHaveBeenCalledWith('note-1', {title: 'Better idea', content: 'A thought', icon: null, version: 3})
        expect(await screen.findByRole('heading', {name: 'Better idea'})).toBeInTheDocument()
        expect(screen.queryByRole('textbox', {name: 'Note text'})).not.toBeInTheDocument()
        expect(notifyNotesChanged).toHaveBeenCalled()
    })

    it('saves formatting applied with the toolbar as Markdown', async () => {
        mockedUpdate.mockResolvedValue({...saved, content: '- A thought', version: 4})
        const {save} = await startEditing()

        fireEvent.click(screen.getByRole('button', {name: 'Bulleted list'}))
        await waitFor(() => expect(save).toBeEnabled())
        await userEvent.click(save)

        expect(mockedUpdate).toHaveBeenCalledWith('note-1', {title: 'Idea', content: '- A thought', icon: null, version: 3})
        expect(await screen.findByRole('listitem')).toHaveTextContent('A thought')
    })

    it('edits against the version a rename from the menu produced', async () => {
        mockedGetNote.mockResolvedValue(saved)
        vi.mocked(renameNote).mockResolvedValue({...saved, title: 'Renamed', version: 4})
        mockedUpdate.mockResolvedValue({...saved, title: 'Renamed', content: 'Edited', version: 5})
        renderPage()
        await userEvent.click(await screen.findByRole('button', {name: 'Actions for Idea'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Rename'}))
        const field = screen.getByRole('textbox', {name: 'Title'})
        await userEvent.clear(field)
        await userEvent.type(field, 'Renamed')
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))
        await screen.findByRole('heading', {name: 'Renamed'})

        await userEvent.click(screen.getByRole('button', {name: 'Edit note'}))
        await userEvent.type(screen.getByRole('textbox', {name: 'Title'}), '!')
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))

        expect(mockedUpdate).toHaveBeenCalledWith('note-1', {title: 'Renamed!', content: 'A thought', icon: null, version: 4})
    })

    it('keeps the edits and explains when the note changed elsewhere', async () => {
        mockedUpdate.mockRejectedValue(
            new NoteApiError('http', 'note save failed (409)', 409, undefined, 'NOTE_VERSION_CONFLICT'))
        const {title, save} = await startEditing()

        await userEvent.type(title, '!')
        await userEvent.click(save)

        expect(await screen.findByRole('alert')).toHaveTextContent('This note changed elsewhere. Copy your edits and reload.')
        expect(screen.getByRole('textbox', {name: 'Title'})).toHaveValue('Idea!')
    })

    it('explains a refusal while a summary update is running', async () => {
        mockedUpdate.mockRejectedValue(new NoteApiError('http', 'note save failed (409)', 409, undefined, 'NOTE_UPDATING'))
        const {title, save} = await startEditing()

        await userEvent.type(title, '!')
        await userEvent.click(save)

        expect(await screen.findByRole('alert')).toHaveTextContent('Uliss is updating this note. Save again when it finishes.')
    })

    it('cannot save a blank title', async () => {
        const {title, save} = await startEditing()

        await userEvent.clear(title)

        expect(save).toBeDisabled()
    })

    it('leaves editing at once when nothing changed', async () => {
        await startEditing()

        await userEvent.click(screen.getByRole('button', {name: 'Cancel'}))

        expect(screen.queryByRole('textbox', {name: 'Note text'})).not.toBeInTheDocument()
        expect(screen.getByText('A thought')).toBeInTheDocument()
    })

    it('asks before discarding edits, and keeps them when the user stays', async () => {
        const {title} = await startEditing()
        await userEvent.type(title, '!')

        await userEvent.click(screen.getByRole('button', {name: 'Cancel'}))
        expect(screen.getByRole('dialog', {name: 'Discard your edits?'})).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: 'Keep editing'}))

        expect(screen.getByRole('textbox', {name: 'Title'})).toHaveValue('Idea!')

        await userEvent.click(screen.getByRole('button', {name: 'Cancel'}))
        await userEvent.click(screen.getByRole('button', {name: 'Discard'}))

        expect(screen.queryByRole('textbox', {name: 'Title'})).not.toBeInTheDocument()
        expect(screen.getByRole('heading', {name: 'Idea'})).toBeInTheDocument()
        expect(mockedUpdate).not.toHaveBeenCalled()
    })

    it('warns before the tab closes with unsaved edits only', async () => {
        const {title} = await startEditing()
        const unchanged = new Event('beforeunload', {cancelable: true})
        window.dispatchEvent(unchanged)
        expect(unchanged.defaultPrevented).toBe(false)

        await userEvent.type(title, '!')
        const changed = new Event('beforeunload', {cancelable: true})
        window.dispatchEvent(changed)

        expect(changed.defaultPrevented).toBe(true)
    })

    it('renders a note written by hand as Markdown too', async () => {
        mockedGetNote.mockResolvedValue({...saved, source: 'MANUAL', content: '- one\n- two'})
        renderPage()

        expect(await screen.findAllByRole('listitem')).toHaveLength(2)
    })
})
