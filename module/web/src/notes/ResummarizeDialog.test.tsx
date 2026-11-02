import {render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {NoteApiError, resummarizeNote} from './noteApi'
import {ResummarizeDialog} from './ResummarizeDialog'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {...actual, resummarizeNote: vi.fn()}
})

const mockedResummarize = vi.mocked(resummarizeNote)
const queued = {id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', content: 'Old', updating: true} as const

describe('ResummarizeDialog', () => {
    beforeEach(() => mockedResummarize.mockReset())

    it('says what is replaced and what stays before anything is sent', () => {
        render(<ResummarizeDialog noteId="note-1" onQueued={vi.fn()} onClose={vi.fn()}/>)

        const dialog = screen.getByRole('dialog', {name: 'Summarize this note again?'})
        expect(dialog).toHaveTextContent('Your edits and additions are replaced; the title, icon and place stay.')
        expect(mockedResummarize).not.toHaveBeenCalled()
    })

    it('queues the rewrite on confirm and hands back the updating note', async () => {
        mockedResummarize.mockResolvedValue(queued)
        const onQueued = vi.fn()
        render(<ResummarizeDialog noteId="note-1" onQueued={onQueued} onClose={vi.fn()}/>)

        await userEvent.click(screen.getByRole('button', {name: 'Summarize'}))

        await waitFor(() => expect(onQueued).toHaveBeenCalledWith(queued))
        expect(mockedResummarize).toHaveBeenCalledWith('note-1', expect.any(String))
    })

    it('shows a refusal in the dialog and retries with the same key', async () => {
        mockedResummarize
            .mockRejectedValueOnce(new NoteApiError('http', 'conflict', 409, undefined, 'SUMMARY_IN_PROGRESS'))
            .mockResolvedValueOnce(queued)
        const onQueued = vi.fn()
        render(<ResummarizeDialog noteId="note-1" onQueued={onQueued} onClose={vi.fn()}/>)

        await userEvent.click(screen.getByRole('button', {name: 'Summarize'}))
        expect(await screen.findByRole('dialog')).toHaveTextContent('Uliss is already writing a note from this chat.')
        await userEvent.click(screen.getByRole('button', {name: 'Summarize'}))

        await waitFor(() => expect(onQueued).toHaveBeenCalled())
        const [first, second] = mockedResummarize.mock.calls
        expect(second[1]).toBe(first[1])
    })

    it.each([
        ['NOTE_NOT_RESUMMARIZABLE', 409, 'The chat of this note is gone'],
        ['NOTE_NOT_READY', 409, 'This note is not ready yet.'],
        [undefined, 404, 'Summarize again is not available any more.'],
    ])('explains a %s refusal', async (code, status, message) => {
        mockedResummarize.mockRejectedValueOnce(new NoteApiError('http', 'refused', status, undefined, code))
        render(<ResummarizeDialog noteId="note-1" onQueued={vi.fn()} onClose={vi.fn()}/>)

        await userEvent.click(screen.getByRole('button', {name: 'Summarize'}))

        expect(await screen.findByRole('dialog')).toHaveTextContent(message)
    })

    it('closes on Cancel without sending', async () => {
        const onClose = vi.fn()
        render(<ResummarizeDialog noteId="note-1" onQueued={vi.fn()} onClose={onClose}/>)

        await userEvent.click(screen.getByRole('button', {name: 'Cancel'}))

        expect(onClose).toHaveBeenCalled()
        expect(mockedResummarize).not.toHaveBeenCalled()
    })
})
