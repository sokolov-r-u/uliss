import {act, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {type EditableNote, NoteEditForm} from './NoteEditForm'
import {type NoteAiEditRequest, NoteApiError, streamNoteAiEdit, updateNote} from './noteApi'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {...actual, streamNoteAiEdit: vi.fn(), updateNote: vi.fn(), notifyNotesChanged: vi.fn()}
})

const mockedStream = vi.mocked(streamNoteAiEdit)

const saved: EditableNote = {
    id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Idea', content: 'A thougth', version: 3,
}

/** A rewrite the test drives chunk by chunk and finishes when it wants. */
interface RunningRewrite {
    request: NoteAiEditRequest
    signal: AbortSignal
    send: (text: string) => void
    finish: (outcome: 'done' | 'error') => void
}

function holdRewrites(): RunningRewrite[] {
    const running: RunningRewrite[] = []
    mockedStream.mockImplementation((_noteId, request, options) => new Promise((resolve, reject) => {
        const signal = options.signal as AbortSignal
        signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
        running.push({request, signal, send: (text) => options.onText(text), finish: resolve})
    }))
    return running
}

function renderForm() {
    const onSaved = vi.fn()
    const view = render(<NoteEditForm note={saved} onSaved={onSaved} onClose={vi.fn()}/>)
    return {
        ...view,
        onSaved,
        command: screen.getByRole('textbox', {name: 'Message'}),
        text: () => screen.getByRole('textbox', {name: 'Note text', hidden: true}),
        save: screen.getByRole('button', {name: 'Save'}),
        cancel: screen.getByRole('button', {name: 'Cancel'}),
    }
}

async function sendCommand(command: HTMLElement, value: string) {
    await userEvent.type(command, value)
    await userEvent.keyboard('{Enter}')
}

describe('NoteEditForm rewrite with the model', () => {
    beforeEach(() => {
        mockedStream.mockReset()
        vi.mocked(updateNote).mockReset()
    })

    afterEach(() => vi.restoreAllMocks())

    it('streams the rewrite in place of a locked editor and makes it an unsaved edit', async () => {
        const running = holdRewrites()
        const form = renderForm()
        await screen.findByText('A thougth')

        await sendCommand(form.command, 'Fix spelling')

        expect(running[0].request).toEqual({instruction: 'Fix spelling', content: 'A thougth'})
        act(() => running[0].send('A tho'))
        await waitFor(() => expect(screen.getByRole('region', {name: 'Text from Uliss'})).toHaveTextContent('A tho'))
        expect(form.save).toBeDisabled()
        expect(form.cancel).toBeDisabled()
        expect(screen.getByRole('textbox', {name: 'Title'})).toBeDisabled()
        expect(screen.getByRole('button', {name: 'Bold'})).toBeDisabled()
        expect(screen.getByRole('button', {name: 'Stop generation'})).toBeInTheDocument()

        act(() => running[0].send('ught'))
        await act(async () => running[0].finish('done'))

        expect(screen.queryByRole('region', {name: 'Text from Uliss'})).not.toBeInTheDocument()
        expect(form.text()).toHaveTextContent('A thought')
        expect(form.command).toHaveValue('')
        expect(form.save).toBeEnabled()
    })

    it('saves the rewritten text with the version the edit started from', async () => {
        const running = holdRewrites()
        vi.mocked(updateNote).mockResolvedValue({...saved, content: 'A thought', version: 4})
        const form = renderForm()
        await screen.findByText('A thougth')
        await sendCommand(form.command, 'Fix spelling')
        act(() => running[0].send('A thought'))
        await act(async () => running[0].finish('done'))

        await userEvent.click(form.save)

        expect(updateNote).toHaveBeenCalledWith('note-1', {title: 'Idea', content: 'A thought', icon: null, version: 3})
        await waitFor(() => expect(form.onSaved).toHaveBeenCalled())
    })

    it('makes the whole rewrite one undo step, and redo brings it back', async () => {
        const running = holdRewrites()
        const form = renderForm()
        await screen.findByText('A thougth')
        await sendCommand(form.command, 'Rewrite')
        act(() => running[0].send('First line\n\n'))
        act(() => running[0].send('Second line'))
        await act(async () => running[0].finish('done'))

        await userEvent.click(screen.getByRole('button', {name: 'Undo'}))
        expect(form.text()).toHaveTextContent('A thougth')
        expect(form.save).toBeDisabled()

        await userEvent.click(screen.getByRole('button', {name: 'Redo'}))
        expect(form.text()).toHaveTextContent('First lineSecond line')
    })

    it('still shows the saved note as the original after a rewrite', async () => {
        const running = holdRewrites()
        const form = renderForm()
        await screen.findByText('A thougth')
        await sendCommand(form.command, 'Fix spelling')
        act(() => running[0].send('A thought'))
        await act(async () => running[0].finish('done'))

        await userEvent.click(screen.getByRole('button', {name: 'Original'}))

        expect(screen.getByRole('region', {name: 'Original note'})).toHaveTextContent('A thougth')
    })

    it('stops on request, drops the partial text and keeps the command', async () => {
        const running = holdRewrites()
        const form = renderForm()
        await screen.findByText('A thougth')
        await sendCommand(form.command, 'Make it shorter')
        act(() => running[0].send('A th'))

        await userEvent.click(screen.getByRole('button', {name: 'Stop generation'}))

        expect(running[0].signal.aborted).toBe(true)
        expect(await screen.findByRole('status')).toHaveTextContent('Stopped.')
        expect(form.text()).toHaveTextContent('A thougth')
        expect(form.command).toHaveValue('Make it shorter')
        expect(form.save).toBeDisabled()
    })

    it('drops the text of a failed rewrite and says so', async () => {
        const running = holdRewrites()
        const form = renderForm()
        await screen.findByText('A thougth')
        await sendCommand(form.command, 'Fix')
        act(() => running[0].send('half'))
        await act(async () => running[0].finish('error'))

        expect(screen.getByRole('status')).toHaveTextContent('Uliss could not rewrite the text. Try again.')
        expect(form.text()).toHaveTextContent('A thougth')
        expect(form.command).toHaveValue('Fix')
    })

    it('explains a refusal while a summary update is running', async () => {
        mockedStream.mockRejectedValue(new NoteApiError('http', 'conflict', 409, undefined, 'NOTE_UPDATING'))
        const form = renderForm()
        await screen.findByText('A thougth')

        await sendCommand(form.command, 'Fix')

        expect(await screen.findByRole('status'))
            .toHaveTextContent('Uliss is updating this note. Try again when it finishes.')
        expect(form.command).toHaveValue('Fix')
    })

    it('says nothing changed when the rewrite reads the same', async () => {
        const running = holdRewrites()
        const form = renderForm()
        await screen.findByText('A thougth')
        await sendCommand(form.command, 'Keep it')
        act(() => running[0].send('A thougth\n'))
        await act(async () => running[0].finish('done'))

        expect(screen.getByRole('status')).toHaveTextContent('Nothing changed.')
        expect(form.save).toBeDisabled()
        expect(screen.getByRole('button', {name: 'Undo'})).toBeDisabled()
    })

    it('does not send a note over the length limit', async () => {
        const long = {...saved, content: 'a'.repeat(30_001)}
        render(<NoteEditForm note={long} onSaved={vi.fn()} onClose={vi.fn()}/>)

        await sendCommand(screen.getByRole('textbox', {name: 'Message'}), 'Fix')

        expect(screen.getByRole('status'))
            .toHaveTextContent('Note is too long for Uliss to edit (30,000 characters at most).')
        expect(mockedStream).not.toHaveBeenCalled()
    })

    it('shows another example command after each sent command', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)
        const running = holdRewrites()
        const form = renderForm()
        const first = form.command.getAttribute('placeholder')

        await sendCommand(form.command, 'Fix')
        await act(async () => running[0].finish('error'))

        expect(form.command.getAttribute('placeholder')).not.toBe(first)
    })

    it('stops the model when the form goes away', async () => {
        const running = holdRewrites()
        const form = renderForm()
        await screen.findByText('A thougth')
        await sendCommand(form.command, 'Fix')

        form.unmount()

        expect(running[0].signal.aborted).toBe(true)
    })
})
