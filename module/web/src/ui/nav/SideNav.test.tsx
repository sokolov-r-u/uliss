import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {deleteChat, listChats} from '../../chat/chatApi'
import {SideNav} from './SideNav'

vi.mock('../../auth/AuthContext', () => ({useAuth: () => ({logout: vi.fn()})}))
vi.mock('../../chat/chatApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../chat/chatApi')>()
    return {...actual, listChats: vi.fn(), deleteChat: vi.fn()}
})

function renderNav(path: string) {
    const nav = <SideNav open={false} collapsed={false} onClose={() => undefined}
                         onToggleCollapsed={() => undefined}/>
    render(<MemoryRouter initialEntries={[path]}><Routes>
        <Route path="/chats/:chatId" element={nav}/>
        <Route path="/chats" element={<div data-testid="chats-route"/>}/>
    </Routes></MemoryRouter>)
}

async function deleteFromSidebar(title: string) {
    await userEvent.click(await screen.findByRole('button', {name: `Actions for ${title}`}))
    await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
    await userEvent.click(screen.getByRole('button', {name: 'Delete'}))
}

describe('SideNav', () => {
    beforeEach(() => {
        vi.mocked(listChats).mockReset().mockResolvedValue([
            {id: 'c1', title: 'Trip', noteCount: 0},
            {id: 'c2', title: 'Books', noteCount: 1},
        ])
        vi.mocked(deleteChat).mockReset().mockResolvedValue(undefined)
    })

    it('leaves the route of a chat deleted from the sidebar', async () => {
        renderNav('/chats/c1')

        await deleteFromSidebar('Trip')

        expect(await screen.findByTestId('chats-route')).toBeInTheDocument()
    })

    it('stays on the open chat when another chat is deleted from the sidebar', async () => {
        renderNav('/chats/c1')

        await deleteFromSidebar('Books')

        expect(deleteChat).toHaveBeenCalledWith('c2')
        expect(screen.queryByTestId('chats-route')).not.toBeInTheDocument()
    })
})
