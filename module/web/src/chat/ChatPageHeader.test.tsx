import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {getChat} from './chatApi'
import {ChatPageHeader} from './ChatPageHeader'

vi.mock('./chatApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./chatApi')>()
    return {...actual, getChat: vi.fn()}
})

describe('ChatPageHeader', () => {
    beforeEach(() => {
        vi.mocked(getChat).mockReset()
    })

    it('drops the previous chat while the next chat is loading', async () => {
        vi.mocked(getChat)
            .mockResolvedValueOnce({id: 'a', title: 'Trip', noteCount: 0})
            .mockImplementationOnce(() => new Promise(() => undefined))
        const view = render(<MemoryRouter><ChatPageHeader chatId="a" generationActive={false}/></MemoryRouter>)
        await screen.findByRole('button', {name: 'Actions for Trip'})

        view.rerender(<MemoryRouter><ChatPageHeader chatId="b" generationActive={false}/></MemoryRouter>)

        expect(screen.queryByText('Trip')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Actions for Trip'})).not.toBeInTheDocument()
    })

    it('titles the chat in the header with its note count and no back link', async () => {
        vi.mocked(getChat).mockResolvedValueOnce({id: 'a', title: 'Trip', noteCount: 2})
        render(<MemoryRouter><ChatPageHeader chatId="a" generationActive={false}/></MemoryRouter>)

        expect(await screen.findByRole('heading', {level: 1, name: 'Trip'})).toBeInTheDocument()
        expect(screen.getByText('2 notes')).toBeInTheDocument()
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('goes back to the previous screen of the app, and offers no Back on a chat opened directly', async () => {
        vi.mocked(getChat).mockResolvedValue({id: 'a', title: 'Trip', noteCount: 0})
        const direct = render(<MemoryRouter><ChatPageHeader chatId="a" generationActive={false}/></MemoryRouter>)
        await screen.findByRole('heading', {name: 'Trip'})
        expect(screen.queryByRole('button', {name: 'Back'})).not.toBeInTheDocument()
        direct.unmount()

        render(<MemoryRouter initialEntries={['/sky', '/chats/a']} initialIndex={1}><Routes>
            <Route path="/sky" element={<div data-testid="sky-route"/>}/>
            <Route path="/chats/:chatId" element={<ChatPageHeader chatId="a" generationActive={false}/>}/>
        </Routes></MemoryRouter>)
        await userEvent.click(await screen.findByRole('button', {name: 'Back'}))

        expect(screen.getByTestId('sky-route')).toBeInTheDocument()
    })

    it('hands the loaded chat to the page and toggles the details panel', async () => {
        vi.mocked(getChat).mockResolvedValueOnce({id: 'a', title: 'Trip', noteCount: 2})
        const onChat = vi.fn()
        const onTogglePanel = vi.fn()
        render(<MemoryRouter><ChatPageHeader chatId="a" generationActive={false} onChat={onChat}
                                             onTogglePanel={onTogglePanel}/></MemoryRouter>)

        await userEvent.click(await screen.findByRole('button', {name: 'Chat details'}))

        expect(onTogglePanel).toHaveBeenCalledOnce()
        expect(onChat).toHaveBeenLastCalledWith({id: 'a', title: 'Trip', noteCount: 2})
    })
})
