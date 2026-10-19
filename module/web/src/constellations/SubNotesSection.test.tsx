import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {listSubNotes} from '../notes/noteApi'
import {SubNotesSection} from './SubNotesSection'

vi.mock('../notes/noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../notes/noteApi')>()
    return {...actual, listSubNotes: vi.fn()}
})

describe('SubNotesSection', () => {
    beforeEach(() => vi.mocked(listSubNotes).mockReset())

    it('lists the direct sub-notes with their count and opens one', async () => {
        vi.mocked(listSubNotes).mockResolvedValue([
            {id: 'low', source: 'MANUAL', status: 'READY', title: 'Low', content: 'x', parentNoteId: 'bowie'},
            {id: 'draft', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null, parentNoteId: 'bowie'},
        ])
        const onOpen = vi.fn()
        render(<SubNotesSection noteId="bowie" onOpen={onOpen}/>)

        expect(await screen.findByText('Sub-notes')).toBeInTheDocument()
        expect(screen.getByText('2')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: /^Untitled note/}))
        expect(onOpen).toHaveBeenCalledWith('draft')
        expect(listSubNotes).toHaveBeenCalledWith('bowie', expect.any(AbortSignal))
    })

    it('shows no section for a note without sub-notes', async () => {
        vi.mocked(listSubNotes).mockResolvedValue([])
        const {container} = render(<SubNotesSection noteId="loose" onOpen={vi.fn()}/>)

        await vi.waitFor(() => expect(listSubNotes).toHaveBeenCalled())
        expect(container).toBeEmptyDOMElement()
    })
})
