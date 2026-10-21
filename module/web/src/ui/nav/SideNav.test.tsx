import {act, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {deleteChat, listChats, notifyChatListChanged} from '../../chat/chatApi'
import {listNotes, notifyNotesChanged} from '../../notes/noteApi'
import {SideNav} from './SideNav'

vi.mock('../../auth/AuthContext', () => ({useAuth: () => ({logout: vi.fn()})}))
vi.mock('../../chat/chatApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../chat/chatApi')>()
    return {...actual, listChats: vi.fn(), deleteChat: vi.fn()}
})
vi.mock('../../notes/noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../notes/noteApi')>()
    return {...actual, listNotes: vi.fn()}
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
        vi.mocked(listNotes).mockReset().mockResolvedValue([
            {id: 'n1', source: 'CHAT_SUMMARY', status: 'READY', title: 'Lisbon plan', content: 'Body',
                createdAt: new Date().toISOString()},
            {id: 'n2', source: 'CHAT_SUMMARY', status: 'READY', title: 'Reading list', content: 'Body',
                createdAt: new Date().toISOString()},
        ])
        localStorage.clear()
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

    it('switches the panel list between chats and notes, grouped by recency', async () => {
        renderNav('/chats/c1')

        expect(await screen.findByRole('button', {name: 'Trip'})).toBeInTheDocument()
        await userEvent.click(screen.getByRole('tab', {name: 'Notes'}))

        expect(await screen.findByRole('button', {name: 'Lisbon plan'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Trip'})).not.toBeInTheDocument()
        expect(screen.getByText('Today')).toBeInTheDocument()
        expect(screen.getByRole('link', {name: 'View all →'})).toHaveAttribute('href', '/notes')
    })

    it('says plainly that nothing is here yet on day one', async () => {
        vi.mocked(listChats).mockResolvedValue([])
        vi.mocked(listNotes).mockResolvedValue([])
        renderNav('/chats/c1')

        expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
        expect(screen.getByText('Chats and notes will collect here as you talk.')).toBeInTheDocument()
        expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    })

    it('tells a failed load apart from an empty account and loads again on Retry', async () => {
        vi.mocked(listChats).mockRejectedValueOnce(new Error('offline')).mockResolvedValue([])
        vi.mocked(listNotes).mockRejectedValueOnce(new Error('offline'))
        renderNav('/chats/c1')

        expect(await screen.findByRole('alert')).toHaveTextContent('Your chats and notes did not load.')
        expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', {name: 'Retry'}))
        expect(await screen.findByRole('tab', {name: /Notes/})).toBeInTheDocument()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('switches the list tabs with the arrows; the selected tab is the only tab stop', async () => {
        renderNav('/chats/c1')
        const chats = await screen.findByRole('tab', {name: /Chats/})
        expect(screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0)).toEqual([chats])
        chats.focus()

        await userEvent.keyboard('{ArrowRight}')

        const notes = screen.getByRole('tab', {name: /Notes/})
        expect(notes).toHaveAttribute('aria-selected', 'true')
        await waitFor(() => expect(notes).toHaveFocus())
        expect(screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0)).toEqual([notes])
    })

    it('shows the note count in the footer and leaves Sign out to Settings', async () => {
        renderNav('/chats/c1')

        expect(await screen.findByText('2 notes')).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Sign out'})).not.toBeInTheDocument()
    })

    it('resizes the rail from its edge handle with the keyboard and remembers the width', async () => {
        renderNav('/chats/c1')
        const handle = await screen.findByRole('separator', {name: 'Resize sidebar'})
        expect(handle).toHaveAttribute('aria-valuenow', '264')

        handle.focus()
        await userEvent.keyboard('{ArrowRight}')

        expect(handle).toHaveAttribute('aria-valuenow', '280')
        expect(localStorage.getItem('uliss.sidenav.width')).toBe('280')
    })

    it('refetches only the list whose data changed', async () => {
        renderNav('/chats/c1')
        await screen.findByRole('button', {name: 'Trip'})
        await waitFor(() => expect(listNotes).toHaveBeenCalledTimes(1))

        act(() => notifyChatListChanged())
        await waitFor(() => expect(listChats).toHaveBeenCalledTimes(2))
        expect(listNotes).toHaveBeenCalledTimes(1)

        act(() => notifyNotesChanged())
        await waitFor(() => expect(listNotes).toHaveBeenCalledTimes(2))
        expect(listChats).toHaveBeenCalledTimes(2)
    })
})

