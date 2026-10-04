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
            {id: 'working', source: 'CHAT_SUMMARY', status: 'GENERATING', title: 'Ignored', content: null},
        ])
        expect(models.map((note) => note.title)).toEqual(['Ownership columns', 'Generating note…'])
        expect(models[0]?.excerpt).toBe('Keep user_id on every table')
    })

    it('hides unsupported row actions', () => {
        const notes = [{id: '1', ordinal: 1, title: 'A note', excerpt: '', date: 'Sep 11', linkCount: 0}]
        render(<MemoryRouter><NotesView notes={notes}/></MemoryRouter>)
        expect(screen.queryByRole('button', {name: 'Actions for A note'})).not.toBeInTheDocument()
    })
})
