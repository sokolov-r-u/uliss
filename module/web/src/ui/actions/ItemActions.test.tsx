import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ListRow} from '@uliss/design-system'
import {ChatApiError, deleteChat, notifyChatListChanged, renameChat} from '../../chat/chatApi'
import {deleteNote, NoteApiError} from '../../notes/noteApi'
import {deleteChatBody, ItemActions, type ItemActionsProps, type ItemActionTarget} from './ItemActions'

vi.mock('../../chat/chatApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../chat/chatApi')>()
    return {...actual, renameChat: vi.fn(), deleteChat: vi.fn(), notifyChatListChanged: vi.fn()}
})
vi.mock('../../notes/noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../notes/noteApi')>()
    return {...actual, renameNote: vi.fn(), deleteNote: vi.fn()}
})

const chat: ItemActionTarget = {kind: 'chat', id: 'c1', title: 'Trip', noteCount: 2}
const note: ItemActionTarget = {kind: 'note', id: 'n1', title: 'Idea', renamable: true}

function renderRow(target: ItemActionTarget, props: Partial<ItemActionsProps> = {}) {
    const onOpen = vi.fn()
    render(<ItemActions target={target} {...props}>
        {(openMenu) => <ListRow title={target.title} onClick={onOpen} onMenu={openMenu}
                                menuLabel={`Actions for ${target.title}`}/>}
    </ItemActions>)
    return {onOpen}
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
    })

    it('words the chat delete warning by note count', () => {
        expect(deleteChatBody(0)).toBeUndefined()
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

    it('names the item at the top of its menu', async () => {
        renderRow(note)

        await openMenu('Idea')

        expect(screen.getByRole('menu', {name: 'Actions for Idea'})).toHaveTextContent(/^Idea/)
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
})
