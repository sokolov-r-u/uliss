import {act, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {notifyChatListChanged} from '../../chat/chatApi'
import {listChatNotes, type Note, notifyNotesChanged, streamNoteStatus} from '../../notes/noteApi'
import {ChatNotesList} from './ChatNotesList'

vi.mock('../../notes/noteApi', async (importOriginal) => ({
    ...await importOriginal<typeof import('../../notes/noteApi')>(),
    listChatNotes: vi.fn(),
    streamNoteStatus: vi.fn(),
}))

const mockedList = vi.mocked(listChatNotes)

function note(overrides: Partial<Note>): Note {
    return {id: 'n-1', source: 'CHAT_SUMMARY', status: 'READY', content: 'Body', createdAt: '2026-06-22T09:00:00Z', ...overrides}
}

describe('ChatNotesList', () => {
    beforeEach(() => {
        mockedList.mockReset()
        vi.mocked(streamNoteStatus).mockReset().mockReturnValue(new Promise(() => undefined))
    })

    it('shows each note of the chat and opens the one clicked', async () => {
        mockedList.mockResolvedValue([
            note({id: 'n-2', status: 'GENERATING', content: null}),
            note({id: 'n-1', title: 'The small room'}),
        ])
        const onOpen = vi.fn()
        render(<ChatNotesList chatId="chat-1" onOpen={onOpen} empty={<p>No notes</p>}/>)

        expect(await screen.findByRole('button', {name: /The small room/})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: /Generating note…/})).toBeInTheDocument()
        expect(screen.queryByText('No notes')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', {name: /The small room/}))
        expect(onOpen).toHaveBeenCalledWith('n-1')
        expect(mockedList).toHaveBeenCalledWith('chat-1', expect.any(AbortSignal))
    })

    it('shows the empty state for a chat without notes', async () => {
        mockedList.mockResolvedValue([])
        render(<ChatNotesList chatId="chat-1" onOpen={vi.fn()} empty={<p>No notes</p>}/>)

        expect(await screen.findByText('No notes')).toBeInTheDocument()
    })

    it('keeps the loaded rows when a background refresh fails', async () => {
        mockedList
            .mockResolvedValueOnce([note({id: 'n-1', title: 'The small room'})])
            .mockRejectedValueOnce(new Error('connection lost'))
        render(<ChatNotesList chatId="chat-1" onOpen={vi.fn()} empty={<p>No notes</p>}/>)
        expect(await screen.findByRole('button', {name: /The small room/})).toBeInTheDocument()

        act(() => notifyNotesChanged())

        await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2))
        expect(screen.getByRole('button', {name: /The small room/})).toBeInTheDocument()
    })

    it('reloads when notes change but not on chat activity', async () => {
        mockedList.mockResolvedValueOnce([]).mockResolvedValue([note({id: 'n-1', title: 'Fresh note'})])
        render(<ChatNotesList chatId="chat-1" onOpen={vi.fn()} empty={<p>No notes</p>}/>)
        expect(await screen.findByText('No notes')).toBeInTheDocument()

        act(() => notifyNotesChanged())
        expect(await screen.findByRole('button', {name: /Fresh note/})).toBeInTheDocument()

        act(() => notifyChatListChanged())
        expect(mockedList).toHaveBeenCalledTimes(2)
    })

    it('never shows the notes of the previous chat', async () => {
        mockedList
            .mockResolvedValueOnce([note({id: 'n-1', title: 'From chat one'})])
            .mockRejectedValueOnce(new Error('connection lost'))
        const {rerender} = render(<ChatNotesList chatId="chat-1" onOpen={vi.fn()} empty={<p>No notes</p>}/>)
        expect(await screen.findByRole('button', {name: /From chat one/})).toBeInTheDocument()

        rerender(<ChatNotesList chatId="chat-2" onOpen={vi.fn()} empty={<p>No notes</p>}/>)

        expect(screen.queryByRole('button', {name: /From chat one/})).not.toBeInTheDocument()
        await waitFor(() => expect(mockedList).toHaveBeenCalledWith('chat-2', expect.any(AbortSignal)))
        expect(screen.getByText('No notes')).toBeInTheDocument()
    })

    it('reloads once a generating note settles', async () => {
        mockedList
            .mockResolvedValueOnce([note({id: 'n-1', status: 'GENERATING', content: null})])
            .mockResolvedValue([note({id: 'n-1', title: 'Finished note'})])
        vi.mocked(streamNoteStatus).mockResolvedValue('READY')
        render(<ChatNotesList chatId="chat-1" onOpen={vi.fn()} empty={<p>No notes</p>}/>)

        expect(await screen.findByRole('button', {name: /Finished note/})).toBeInTheDocument()
        expect(streamNoteStatus).toHaveBeenCalledWith('n-1', expect.objectContaining({signal: expect.any(AbortSignal)}))
    })
})
