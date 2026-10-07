import {render, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
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
})
