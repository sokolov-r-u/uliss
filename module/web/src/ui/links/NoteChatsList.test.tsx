import {render, screen, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {listNoteChats} from '../../chat/chatApi'
import {NoteChatsList} from './NoteChatsList'

vi.mock('../../chat/chatApi', async (importOriginal) => ({
    ...await importOriginal<typeof import('../../chat/chatApi')>(),
    listNoteChats: vi.fn(),
}))

const mockedList = vi.mocked(listNoteChats)

describe('NoteChatsList', () => {
    beforeEach(() => mockedList.mockReset())

    it('never shows the chats of the previous note', async () => {
        mockedList
            .mockResolvedValueOnce([{id: 'c-1', title: 'Chat of note one', noteCount: 1}])
            .mockRejectedValueOnce(new Error('connection lost'))
        const {rerender} = render(<NoteChatsList noteId="n-1" onOpen={vi.fn()} empty={<p>Written by hand</p>}/>)
        expect(await screen.findByRole('button', {name: /Chat of note one/})).toBeInTheDocument()

        rerender(<NoteChatsList noteId="n-3" onOpen={vi.fn()} empty={<p>Written by hand</p>}/>)

        expect(screen.queryByRole('button', {name: /Chat of note one/})).not.toBeInTheDocument()
        await waitFor(() => expect(mockedList).toHaveBeenCalledWith('n-3', expect.any(AbortSignal)))
        // a failed load says so instead of claiming the list is empty
        expect(await screen.findByText('Could not load the chats.')).toBeInTheDocument()
    })
})
