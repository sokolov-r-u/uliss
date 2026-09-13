import {render, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {describe, expect, it} from 'vitest'
import {NotesView, toNoteViewModels} from './NotesPage'

describe('notes list presentation', () => {
    it('derives ready titles and honest status labels', () => {
        const models = toNoteViewModels([
            {id: 'ready', source: 'CHAT_SUMMARY', status: 'READY', content: 'First line\nSecond line'},
            {id: 'working', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null},
            {id: 'failed', source: 'CHAT_SUMMARY', status: 'FAILED', content: null},
        ])
        expect(models.map((note) => note.title)).toEqual(['First line', 'Generating note…', 'Summary failed'])
        expect(models[0]?.excerpt).toBe('Second line')
    })

    it('hides unsupported row actions', () => {
        const notes = [{id: '1', ordinal: 1, title: 'A note', excerpt: '', date: 'Sep 11', linkCount: 0}]
        render(<MemoryRouter><NotesView notes={notes}/></MemoryRouter>)
        expect(screen.queryByRole('button', {name: 'Actions for A note'})).not.toBeInTheDocument()
    })
})
