import {act, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {deleteChat, listChats, listPinnedChats} from './chatApi'
import {ChatListPage} from './ChatListPage'

vi.mock('./chatApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./chatApi')>()
    return {...actual, listChats: vi.fn(), deleteChat: vi.fn(), listPinnedChats: vi.fn()}
})

describe('ChatListPage', () => {
    beforeEach(() => {
        vi.mocked(listChats).mockReset()
        vi.mocked(deleteChat).mockReset().mockResolvedValue(undefined)
        vi.mocked(listPinnedChats).mockReset().mockResolvedValue([])
    })

    it('puts the pinned chats above the months under their own label', async () => {
        vi.mocked(listChats).mockResolvedValue({items: [
            {id: 'c1', title: 'Trip', noteCount: 0, createdAt: '2026-06-22T09:00:00Z'},
        ], nextCursor: null})
        vi.mocked(listPinnedChats).mockResolvedValue([{id: 'c2', title: 'Books', noteCount: 1}])
        render(<MemoryRouter><ChatListPage/></MemoryRouter>)

        const pinned = await screen.findByText('Pinned')
        expect(pinned.compareDocumentPosition(screen.getByRole('button', {name: /^Books/})))
            .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(screen.getByRole('button', {name: /^Books/}).compareDocumentPosition(screen.getByRole('button', {name: /^Trip/})))
            .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })

    it('with only pinned chats does not say there are none', async () => {
        vi.mocked(listChats).mockResolvedValue({items: [], nextCursor: null})
        vi.mocked(listPinnedChats).mockResolvedValue([{id: 'c2', title: 'Books', noteCount: 1}])
        render(<MemoryRouter><ChatListPage/></MemoryRouter>)

        expect(await screen.findByRole('button', {name: /^Books/})).toBeInTheDocument()
        expect(screen.queryByText('No chats yet')).not.toBeInTheDocument()
    })

    it('shows each chat note count and its actions button', async () => {
        vi.mocked(listChats).mockResolvedValue({items: [{id: 'c1', title: 'Trip', noteCount: 2}], nextCursor: null})
        render(<MemoryRouter><ChatListPage/></MemoryRouter>)

        const actions = await screen.findByRole('button', {name: 'Actions for Trip'})
        expect(screen.getByRole('button', {name: /^Trip/})).toHaveTextContent('2')
        expect(actions).toBeInTheDocument()
    })

    it('reloads without a loading flash after a chat is deleted', async () => {
        let finishReload: (chats: Awaited<ReturnType<typeof listChats>>) => void = () => undefined
        vi.mocked(listChats)
            .mockResolvedValueOnce({items: [{id: 'c1', title: 'Trip', noteCount: 0}, {id: 'c2', title: 'Books', noteCount: 0}], nextCursor: null})
            .mockImplementationOnce(() => new Promise((resolve) => {
                finishReload = resolve
            }))
        render(<MemoryRouter><ChatListPage/></MemoryRouter>)

        await userEvent.click(await screen.findByRole('button', {name: 'Actions for Trip'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))

        await waitFor(() => expect(listChats).toHaveBeenCalledTimes(2))
        expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Actions for Books'})).toBeInTheDocument()

        act(() => finishReload({items: [{id: 'c2', title: 'Books', noteCount: 0}], nextCursor: null}))
        await waitFor(() => expect(screen.queryByRole('button', {name: 'Actions for Trip'})).not.toBeInTheDocument())
    })

    it('keeps the loaded rows when a background refresh fails', async () => {
        vi.mocked(listChats)
            .mockResolvedValueOnce({items: [{id: 'c1', title: 'Trip', noteCount: 0}, {id: 'c2', title: 'Books', noteCount: 0}], nextCursor: null})
            .mockRejectedValueOnce(new Error('connection lost'))
        render(<MemoryRouter><ChatListPage/></MemoryRouter>)

        await userEvent.click(await screen.findByRole('button', {name: 'Actions for Trip'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))

        await waitFor(() => expect(listChats).toHaveBeenCalledTimes(2))
        await act(async () => undefined)
        expect(screen.queryByText('connection lost')).not.toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Actions for Books'})).toBeInTheDocument()
    })

    it('groups chats under month headings', async () => {
        vi.mocked(listChats).mockResolvedValue({items: [
            {id: 'c1', title: 'Trip', noteCount: 0, createdAt: '2026-06-22T09:00:00Z'},
        ], nextCursor: null})
        render(<MemoryRouter><ChatListPage/></MemoryRouter>)

        const june = new Date('2026-06-22T09:00:00Z').toLocaleDateString(undefined, {month: 'long', year: 'numeric'})
        expect(await screen.findByText(june)).toBeInTheDocument()
    })
})
