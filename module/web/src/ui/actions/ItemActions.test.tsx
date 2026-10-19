import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ListRow} from '@uliss/design-system'
import {MemoryRouter, useLocation, useNavigate} from 'react-router-dom'
import {ChatApiError, deleteChat, notifyChatListChanged, renameChat} from '../../chat/chatApi'
import {
    deleteNote,
    listChatNotes,
    listSubNotes,
    type Note,
    NoteApiError,
    renameNote,
    subscribeToNotesChanges,
} from '../../notes/noteApi'
import {deleteChatBody, ItemActions, type ItemActionsProps, type ItemActionTarget} from './ItemActions'

vi.mock('../../chat/chatApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../chat/chatApi')>()
    return {...actual, renameChat: vi.fn(), deleteChat: vi.fn(), notifyChatListChanged: vi.fn()}
})
vi.mock('../../notes/noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../notes/noteApi')>()
    return {...actual, renameNote: vi.fn(), deleteNote: vi.fn(), listChatNotes: vi.fn(), listSubNotes: vi.fn(() => Promise.resolve([]))}
})

const chat: ItemActionTarget = {kind: 'chat', id: 'c1', title: 'Trip', noteCount: 2}
const note: ItemActionTarget = {kind: 'note', id: 'n1', title: 'Idea', renamable: true}

function renderRow(target: ItemActionTarget, props: Partial<ItemActionsProps> = {}, entry = '/chats') {
    const onOpen = vi.fn()
    render(<MemoryRouter initialEntries={[entry]}>
        <ItemActions target={target} {...props}>
            {(openMenu) => <ListRow title={target.title} onClick={onOpen} onMenu={openMenu}
                                    menuLabel={`Actions for ${target.title}`}/>}
        </ItemActions>
        <RoutePath/>
    </MemoryRouter>)
    return {onOpen}
}

function RoutePath() {
    const location = useLocation()
    const navigate = useNavigate()
    return <>
        <output data-testid="route-path">{location.pathname}</output>
        <output data-testid="route-search">{location.search}</output>
        <button type="button" onClick={() => navigate(-1)}>Go back</button>
    </>
}

async function openMenu(title: string) {
    await userEvent.click(screen.getByRole('button', {name: `Actions for ${title}`}))
}

describe('ItemActions', () => {
    beforeEach(() => {
        vi.mocked(notifyChatListChanged).mockClear()
        vi.mocked(deleteNote).mockReset()
        vi.mocked(deleteChat).mockReset()
        vi.mocked(renameChat).mockReset()
        vi.mocked(listChatNotes).mockReset().mockResolvedValue([])
        vi.mocked(listSubNotes).mockReset().mockResolvedValue([])
    })

    it('lists the notes that survive a chat delete and opens one from the dialog', async () => {
        vi.mocked(listChatNotes).mockResolvedValue([
            {id: 'n-7', source: 'CHAT_SUMMARY', status: 'READY', title: 'Lisbon notes', content: 'Body'},
        ])
        renderRow(chat)

        await openMenu('Trip')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        const dialog = screen.getByRole('dialog', {name: 'Delete “Trip”?'})
        await userEvent.click(await within(dialog).findByRole('button', {name: /Lisbon notes/}))

        expect(screen.getByTestId('route-path')).toHaveTextContent('/notes/n-7')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(deleteChat).not.toHaveBeenCalled()
    })

    it('going back from a note opened in the dialog reopens the dialog of the same host', async () => {
        vi.mocked(listChatNotes).mockResolvedValue([
            {id: 'n-7', source: 'CHAT_SUMMARY', status: 'READY', title: 'Lisbon notes', content: 'Body'},
        ])
        renderRow(chat, {dialogHost: 'list'})
        await openMenu('Trip')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(await screen.findByRole('button', {name: /Lisbon notes/}))
        expect(screen.getByTestId('route-path')).toHaveTextContent('/notes/n-7')

        await userEvent.click(screen.getByRole('button', {name: 'Go back'}))

        expect(screen.getByTestId('route-path')).toHaveTextContent('/chats')
        expect(await screen.findByRole('dialog', {name: 'Delete “Trip”?'})).toBeInTheDocument()
        // The reopened dialog clears its marker, so closing it leaves a plain URL.
        await waitFor(() => expect(screen.getByTestId('route-search')).toBeEmptyDOMElement())
    })

    it('leaves a delete marker of another host alone', () => {
        renderRow(chat, {dialogHost: 'list'}, '/chats?deleteChat=c1&in=nav')

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByTestId('route-search')).toHaveTextContent('?deleteChat=c1&in=nav')
    })

    it('opens a note without a way back when the dialog has no host', async () => {
        vi.mocked(listChatNotes).mockResolvedValue([
            {id: 'n-7', source: 'CHAT_SUMMARY', status: 'READY', title: 'Lisbon notes', content: 'Body'},
        ])
        renderRow(chat)
        await openMenu('Trip')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(await screen.findByRole('button', {name: /Lisbon notes/}))

        await userEvent.click(screen.getByRole('button', {name: 'Go back'}))

        expect(screen.getByTestId('route-search')).toBeEmptyDOMElement()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not look up notes for a chat without notes', async () => {
        renderRow({kind: 'chat', id: 'c2', title: 'Empty', noteCount: 0})

        await openMenu('Empty')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))

        expect(screen.getByRole('dialog', {name: 'Delete “Empty”?'})).toHaveTextContent('No notes were written from it.')
        expect(listChatNotes).not.toHaveBeenCalled()
    })

    it('words the chat delete warning by note count', () => {
        expect(deleteChatBody(0)).toBe('No notes were written from it. The conversation does not come back.')
        expect(deleteChatBody(1)).toBe('Uliss wrote a note from this chat. It will stay — delete it from Notes if you no longer need it.')
        expect(deleteChatBody(3)).toBe('Uliss wrote 3 notes from this chat. They will stay — delete them from Notes if you no longer need them.')
    })

    it('renames a chat through the dialog and refreshes chat lists', async () => {
        vi.mocked(renameChat).mockResolvedValue({id: 'c1', title: 'Lisbon', noteCount: 2})
        const onRenamed = vi.fn()
        renderRow(chat, {onRenamed})

        await openMenu('Trip')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Rename'}))
        const field = screen.getByRole('textbox')
        await userEvent.clear(field)
        await userEvent.type(field, '  Lisbon ')
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))

        await waitFor(() => expect(onRenamed).toHaveBeenCalledWith('Lisbon'))
        expect(renameChat).toHaveBeenCalledWith('c1', 'Lisbon')
        expect(notifyChatListChanged).toHaveBeenCalled()
    })

    it('warns about surviving notes and shows a 409 inside the delete dialog', async () => {
        vi.mocked(deleteChat).mockRejectedValue(new ChatApiError('chat delete failed (409)', 409))
        const onDeleted = vi.fn()
        renderRow(chat, {onDeleted})

        await openMenu('Trip')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        expect(screen.getByRole('dialog', {name: 'Delete “Trip”?'})).toHaveTextContent('Uliss wrote 2 notes from this chat.')
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))

        expect(await screen.findByText('Stop the reply before deleting this chat.')).toBeInTheDocument()
        expect(onDeleted).not.toHaveBeenCalled()
    })

    it('treats an already-deleted note as deleted and refreshes chat counts', async () => {
        vi.mocked(deleteNote).mockRejectedValue(new NoteApiError('http', 'note delete failed (404)', 404))
        const onDeleted = vi.fn()
        renderRow(note, {onDeleted})

        await openMenu('Idea')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        expect(screen.getByRole('dialog', {name: 'Delete “Idea”?'})).not.toHaveTextContent('Uliss wrote')
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))

        await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
        expect(notifyChatListChanged).toHaveBeenCalled()
    })

    const subNote = (id: string): Note =>
        ({id, source: 'MANUAL', status: 'READY', title: id, content: 'x', parentNoteId: 'n1'})

    it('asks what happens to the sub-notes of a note, keeping them by default', async () => {
        vi.mocked(listSubNotes).mockResolvedValue([subNote('low'), subNote('heroes')])
        vi.mocked(deleteNote).mockResolvedValue(undefined)
        const onDeleted = vi.fn()
        renderRow(note, {onDeleted})

        await openMenu('Idea')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        const dialog = await screen.findByRole('dialog', {name: 'Delete “Idea”?'})
        await waitFor(() => expect(dialog).toHaveTextContent('“Idea” has 2 sub-notes.'))
        expect(within(dialog).getByRole('radio', {name: /Keep sub-notes/})).toHaveAttribute('aria-checked', 'true')
        await userEvent.click(within(dialog).getByRole('button', {name: 'Delete'}))

        expect(deleteNote).toHaveBeenCalledWith('n1', 'KEEP')
        await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    })

    it('deletes a note with all its sub-notes when asked to', async () => {
        vi.mocked(listSubNotes).mockResolvedValue([subNote('low')])
        vi.mocked(deleteNote).mockResolvedValue(undefined)
        renderRow(note)

        await openMenu('Idea')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(await screen.findByRole('radio', {name: /Delete all/}))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))

        expect(deleteNote).toHaveBeenCalledWith('n1', 'DELETE')
    })

    it('recounts and asks when a sub-note appeared after the dialog opened', async () => {
        vi.mocked(listSubNotes).mockResolvedValueOnce([]).mockResolvedValue([subNote('low')])
        vi.mocked(deleteNote).mockRejectedValueOnce(
            new NoteApiError('http', 'note delete failed (409)', 409, undefined, 'NOTE_HAS_SUB_NOTES'))
        const onDeleted = vi.fn()
        renderRow(note, {onDeleted})

        await openMenu('Idea')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await waitFor(() => expect(listSubNotes).toHaveBeenCalledTimes(1))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))

        expect(deleteNote).toHaveBeenCalledWith('n1', undefined)
        expect(await screen.findByRole('radio', {name: /Keep sub-notes/})).toBeInTheDocument()
        expect(screen.getByRole('dialog')).toHaveTextContent('“Idea” has a sub-note.')
        expect(onDeleted).not.toHaveBeenCalled()
    })

    it('sends one delete request when confirm is pressed again while pending', async () => {
        let finish: () => void = () => undefined
        vi.mocked(deleteNote).mockImplementation(() => new Promise<void>((resolve) => {
            finish = resolve
        }))
        renderRow(note)

        await openMenu('Idea')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))
        await userEvent.click(screen.getByRole('button', {name: 'Deleting…'}))
        finish()

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(deleteNote).toHaveBeenCalledTimes(1)
    })

    it('keeps the menu to its actions without repeating the item title', async () => {
        renderRow(note)

        await openMenu('Idea')

        expect(screen.getByRole('menu', {name: 'Actions for Idea'})).toHaveTextContent(/^RenameDelete$/)
    })

    it('offers only Delete for a note that is not ready', async () => {
        renderRow({...note, renamable: false})
        await openMenu('Idea')
        expect(screen.queryByRole('menuitem', {name: 'Rename'})).not.toBeInTheDocument()
        expect(screen.getByRole('menuitem', {name: 'Delete'})).toBeInTheDocument()
    })

    it('opens the menu on a touch long-press without opening the row', () => {
        vi.useFakeTimers()
        try {
            const {onOpen} = renderRow(note)
            const rowButton = screen.getByRole('button', {name: 'Idea'})
            fireEvent.pointerDown(rowButton, {pointerType: 'touch', clientX: 10, clientY: 10})
            act(() => vi.advanceTimersByTime(500))
            fireEvent.pointerUp(rowButton, {pointerType: 'touch'})
            fireEvent.click(rowButton)

            expect(screen.getByRole('menu', {name: 'Actions for Idea'})).toBeInTheDocument()
            expect(onOpen).not.toHaveBeenCalled()
        } finally {
            vi.useRealTimers()
        }
    })

    it('shows the server message for an invalid title inside the rename dialog', async () => {
        vi.mocked(renameChat).mockRejectedValue(new ChatApiError('chat rename failed (400)', 400))
        renderRow(chat)

        await openMenu('Trip')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Rename'}))
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))

        expect(await screen.findByText('Use a title of 1 to 50 characters.')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Rename chat'})).toBeInTheDocument()
    })

    it('disables Save for a blank title and collapses whitespace before sending', async () => {
        vi.mocked(renameChat).mockResolvedValue({id: 'c1', title: 'Trip to Lisbon', noteCount: 2})
        renderRow(chat)

        await openMenu('Trip')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Rename'}))
        const field = screen.getByRole('textbox')
        await userEvent.clear(field)
        await userEvent.type(field, '   ')
        expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled()

        await userEvent.type(field, 'Trip   to Lisbon')
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))

        await waitFor(() => expect(renameChat).toHaveBeenCalledWith('c1', 'Trip to Lisbon'))
    })

    it('greys Delete while the chat reply is streaming', async () => {
        renderRow(chat, {deleteDisabled: true})

        await openMenu('Trip')

        expect(screen.getByRole('menuitem', {name: 'Delete'})).toBeDisabled()
    })

    it('tells note lists, not chat lists, about a renamed note', async () => {
        const notes = vi.fn()
        const stopNotes = subscribeToNotesChanges(notes)
        vi.mocked(renameNote).mockResolvedValue({id: 'n1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Better', content: 'x'})
        renderRow(note)

        await openMenu('Idea')
        await userEvent.click(screen.getByRole('menuitem', {name: 'Rename'}))
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))

        await waitFor(() => expect(notes).toHaveBeenCalledOnce())
        expect(notifyChatListChanged).not.toHaveBeenCalled()
        stopNotes()
    })
})
