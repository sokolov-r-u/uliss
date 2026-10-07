import {act, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {deleteChat, listChats} from './chatApi'
import {ChatListPage} from './ChatListPage'

vi.mock('./chatApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./chatApi')>()
    return {...actual, listChats: vi.fn(), deleteChat: vi.fn()}
})

describe('ChatListPage', () => {
    beforeEach(() => {
        vi.mocked(listChats).mockReset()
        vi.mocked(deleteChat).mockReset().mockResolvedValue(undefined)
    })

    it('shows each chat note count and its actions button', async () => {
        vi.mocked(listChats).mockResolvedValue([{id: 'c1', title: 'Trip', noteCount: 2}])
        render(<MemoryRouter><ChatListPage/></MemoryRouter>)

        const actions = await screen.findByRole('button', {name: 'Actions for Trip'})
        expect(screen.getByRole('button', {name: /^Trip/})).toHaveTextContent('2')
        expect(actions).toBeInTheDocument()
    })

    it('reloads without a loading flash after a chat is deleted', async () => {
        let finishReload: (chats: Awaited<ReturnType<typeof listChats>>) => void = () => undefined
        vi.mocked(listChats)
            .mockResolvedValueOnce([{id: 'c1', title: 'Trip', noteCount: 0}, {id: 'c2', title: 'Books', noteCount: 0}])
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

        act(() => finishReload([{id: 'c2', title: 'Books', noteCount: 0}]))
        await waitFor(() => expect(screen.queryByRole('button', {name: 'Actions for Trip'})).not.toBeInTheDocument())
    })
})
