import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import type {Note} from '../notes/noteApi'
import {nestNotes, NoteTreeList} from './NoteTreeList'

const note = (id: string, title: string, parentNoteId?: string): Note =>
    ({id, title, source: 'MANUAL', status: 'READY', content: 'x', ...(parentNoteId ? {parentNoteId} : {})})

// Newest first, as the service lists them.
const NOTES = [note('warszawa', 'Warszawa', 'low'), note('heroes', 'Heroes', 'bowie'), note('low', 'Low', 'bowie'),
    note('bowie', 'Bowie'), note('orphan', 'Orphan', 'elsewhere')]

describe('NoteTreeList', () => {
    it('nests notes under their parents in the listed order; a note with an unlisted parent stays on top', () => {
        const nested = nestNotes(NOTES)

        expect(nested.map((branch) => branch.note.id)).toEqual(['bowie', 'orphan'])
        expect(nested[0]!.children.map((branch) => branch.note.id)).toEqual(['heroes', 'low'])
        expect(nested[0]!.children[1]!.children.map((branch) => branch.note.id)).toEqual(['warszawa'])
    })

    it('folds sub-notes and unfolds one level per chevron', async () => {
        const onOpen = vi.fn()
        render(<NoteTreeList notes={NOTES} onOpen={onOpen}/>)

        expect(screen.queryByRole('button', {name: /^Low/})).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: 'Show 2 sub-notes of Bowie'}))
        expect(screen.getByRole('button', {name: /^Low/})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: /^Warszawa/})).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', {name: 'Show 1 sub-note of Low'}))
        await userEvent.click(screen.getByRole('button', {name: /^Warszawa/}))
        expect(onOpen).toHaveBeenCalledWith('warszawa')

        await userEvent.click(screen.getByRole('button', {name: 'Hide 2 sub-notes of Bowie'}))
        expect(screen.queryByRole('button', {name: /^Low/})).not.toBeInTheDocument()
    })
})
