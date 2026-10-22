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

    it('prefers the stored title and keeps the whole content as the excerpt', () => {
        const models = toNoteViewModels([
            {
                id: 'titled',
                source: 'CHAT_SUMMARY',
                status: 'READY',
                title: 'Ownership columns',
                content: 'Keep user_id\non every table',
            },
            {id: 'working', source: 'CHAT_SUMMARY', status: 'GENERATING', title: 'Giant Steps', content: null},
            {id: 'unnamed', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null},
        ])
        // a name the user gave shows while the note is still being written
        expect(models.map((note) => note.title)).toEqual(['Ownership columns', 'Giant Steps', 'Generating note…'])
        expect(models.map((note) => note.excerpt)).toEqual(['Keep user_id on every table', 'Generating note…', ''])
    })

    it('hides row actions when the view has no action handlers', () => {
        const notes = [{id: '1', ordinal: 1, title: 'A note', excerpt: '', date: 'Sep 11', linkCount: 0}]
        render(<MemoryRouter><NotesView notes={notes}/></MemoryRouter>)
        expect(screen.queryByRole('button', {name: 'Actions for A note'})).not.toBeInTheDocument()
    })

    it('marks only ready notes as renamable', () => {
        const models = toNoteViewModels([
            {id: 'ready', source: 'CHAT_SUMMARY', status: 'READY', content: 'Body'},
            {id: 'working', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null},
            {id: 'failed', source: 'CHAT_SUMMARY', status: 'FAILED', content: null},
        ])
        expect(models.map((model) => model.renamable)).toEqual([true, false, false])
    })

    it('lists titles without ordinals, counts the notes and groups them by month', () => {
        const notes = [
            {id: 'a', ordinal: 142, title: 'The empty room', excerpt: '', date: 'Jun 22', linkCount: 0,
                createdAt: '2026-06-22T09:00:00Z'},
            {id: 'b', ordinal: 141, title: 'A grammar for mornings', excerpt: '', date: 'May 21', linkCount: 0,
                createdAt: '2026-05-21T09:00:00Z'},
        ]
        render(<MemoryRouter><NotesView notes={notes}/></MemoryRouter>)

        expect(screen.getByText('The empty room')).toBeInTheDocument()
        expect(screen.queryByText(/142/)).not.toBeInTheDocument()
        expect(screen.getByText('2')).toBeInTheDocument()
        const june = new Date('2026-06-22T09:00:00Z').toLocaleDateString(undefined, {month: 'long', year: 'numeric'})
        expect(screen.getByText(june)).toBeInTheDocument()
    })
})
