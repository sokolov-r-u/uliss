import {act, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {dataRouter} from '../test/dataRouter'
import {createNote, type Note, NoteAlreadyCreatedError, NoteApiError, notifyNotesChanged} from './noteApi'
import {NoteCreatePage} from './NoteCreatePage'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {...actual, createNote: vi.fn(), notifyNotesChanged: vi.fn()}
})

// jsdom cannot type into ProseMirror; the form only needs the editor's Markdown and whether it changed
vi.mock('./editor/NoteEditor', () => ({
    NoteEditor: ({content, onChange, locked}: {
        content: string
        onChange: (change: { markdown: string; changed: boolean }) => void
        locked: boolean
    }) => <textarea aria-label="Note text" defaultValue={content} disabled={locked}
                    onChange={(event) => onChange({markdown: event.target.value, changed: event.target.value !== content})}/>,
}))

vi.mock('emoji-picker-element/database.js', () => import('../test/emojiPickerFake').then((m) => m.databaseModule))
vi.mock('emoji-picker-element/picker.js', () => import('../test/emojiPickerFake').then((m) => m.pickerModule()))

const mockedCreate = vi.mocked(createNote)

const created: Note = {id: 'new-1', source: 'MANUAL', status: 'READY', title: 'Mine', content: 'body', version: 0}

function renderPage() {
    const {router, ui} = dataRouter(<Routes>
        <Route path="/notes" element={<p>Notes list</p>}/>
        <Route path="/notes/new" element={<NoteCreatePage/>}/>
        <Route path="/notes/:noteId" element={<p>Note page</p>}/>
    </Routes>, ['/notes', '/notes/new'])
    render(ui)
    return {
        router,
        title: screen.getByRole('textbox', {name: 'Title'}),
        text: screen.getByRole('textbox', {name: 'Note text'}),
        save: screen.getByRole('button', {name: 'Save'}),
    }
}

describe('NoteCreatePage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('opens an empty form without the model command, saving only with a title and text', async () => {
        const {title, text, save} = renderPage()

        expect(screen.getByText('New note')).toBeInTheDocument()
        expect(screen.queryByRole('textbox', {name: 'Message'})).not.toBeInTheDocument()
        expect(save).toBeDisabled()
        await userEvent.type(title, 'Mine')
        expect(save).toBeDisabled()
        await userEvent.type(text, 'body')
        expect(save).toBeEnabled()
    })

    it('creates the note and opens it in place of the form', async () => {
        mockedCreate.mockResolvedValue(created)
        const {router, title, text, save} = renderPage()
        await userEvent.type(title, ' Mine ')
        await userEvent.type(text, 'body')

        await userEvent.click(save)

        expect(await screen.findByText('Note page')).toBeInTheDocument()
        expect(mockedCreate).toHaveBeenCalledWith(expect.any(String), {title: 'Mine', content: 'body', icon: null})
        expect(vi.mocked(notifyNotesChanged)).toHaveBeenCalled()
        expect(router.state.location.pathname).toBe('/notes/new-1')
        // the form's history entry is replaced: Back goes to the list without asking
        await act(() => router.navigate(-1))
        expect(router.state.location.pathname).toBe('/notes')
    })

    it('retries a failed save with the same idempotency key', async () => {
        mockedCreate.mockRejectedValueOnce(new NoteApiError('transport', 'down')).mockResolvedValueOnce(created)
        const {title, text, save} = renderPage()
        await userEvent.type(title, 'Mine')
        await userEvent.type(text, 'body')

        await userEvent.click(save)
        expect(await screen.findByRole('alert')).toBeInTheDocument()
        await userEvent.click(save)

        await screen.findByText('Note page')
        const [first, second] = mockedCreate.mock.calls.map(([key]) => key)
        expect(second).toBe(first)
    })

    it('links to the note a lost response already saved and keeps the text', async () => {
        mockedCreate.mockRejectedValue(new NoteAlreadyCreatedError('new-1'))
        const {title, text, save} = renderPage()
        await userEvent.type(title, 'Mine')
        await userEvent.type(text, 'body, edited')

        await userEvent.click(save)

        expect(await screen.findByRole('alert')).toHaveTextContent('This note was already saved')
        expect(screen.getByRole('link', {name: 'Open the saved note'})).toHaveAttribute('href', '/notes/new-1')
        expect(text).toHaveValue('body, edited')
    })

    it('asks before Cancel drops what was written, and keeps it when the user stays', async () => {
        const {router, text} = renderPage()
        await userEvent.type(text, 'draft')

        await userEvent.click(screen.getByRole('button', {name: 'Cancel'}))
        expect(screen.getByRole('dialog', {name: 'Discard this note?'})).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: 'Keep editing'}))
        expect(text).toHaveValue('draft')

        await userEvent.click(screen.getByRole('button', {name: 'Cancel'}))
        await userEvent.click(screen.getByRole('button', {name: 'Discard'}))

        expect(router.state.location.pathname).toBe('/notes')
        expect(mockedCreate).not.toHaveBeenCalled()
    })

    it('holds the browser Back and the header Back over what was written', async () => {
        const {router, title} = renderPage()
        await userEvent.type(title, 'Mine')

        await act(() => router.navigate(-1))
        expect(screen.getByRole('dialog', {name: 'Discard this note?'})).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: 'Keep editing'}))
        expect(router.state.location.pathname).toBe('/notes/new')

        await userEvent.click(screen.getByRole('button', {name: 'Back'}))
        await userEvent.click(screen.getByRole('button', {name: 'Discard'}))

        expect(router.state.location.pathname).toBe('/notes')
    })

    it('leaves an untouched form at once', async () => {
        const {router} = renderPage()

        await userEvent.click(screen.getByRole('button', {name: 'Cancel'}))

        expect(router.state.location.pathname).toBe('/notes')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
})
