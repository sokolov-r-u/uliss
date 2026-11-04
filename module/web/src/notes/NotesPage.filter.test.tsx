import {render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes, useLocation} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {listConstellations} from '../constellations/constellationApi'
import type {Constellation} from '../constellations/constellationApi'
import {deleteNote, listNotes, listPinnedNotes, type Note, pinNote} from './noteApi'
import {NotesPage} from './NotesPage'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {...actual, listNotes: vi.fn(), listPinnedNotes: vi.fn(), deleteNote: vi.fn(), pinNote: vi.fn(),
        listSubNotes: vi.fn(() => Promise.resolve([]))}
})
vi.mock('../constellations/constellationApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../constellations/constellationApi')>()
    return {...actual, listConstellations: vi.fn()}
})

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const MUSIC = id(1)
const JAZZ = id(2)
const FILMS = id(3)

const constellation = (cid: string, parentId: string | null, name: string): Constellation =>
    ({id: cid, parentId, name, hue: 200, lightness: 'BASE', noteCount: 1, ownNoteCount: 1})

const note = (nid: string, title: string): Note =>
    ({id: nid, source: 'MANUAL', status: 'READY', title, content: 'Body'} as Note)

let location = ''

function LocationProbe() {
    location = useLocation().search
    return null
}

function renderPage(search = '') {
    render(<MemoryRouter initialEntries={[`/notes${search}`]}><Routes>
        <Route path="/notes" element={<><NotesPage/><LocationProbe/></>}/>
    </Routes></MemoryRouter>)
}

/** The constellation ids of the last list request. */
const lastFilter = () => vi.mocked(listNotes).mock.lastCall?.[2] ?? []

describe('NotesPage constellation filter', () => {
    beforeEach(() => {
        location = ''
        vi.mocked(listConstellations).mockReset().mockResolvedValue([
            constellation(MUSIC, null, 'Music'), constellation(JAZZ, MUSIC, 'Jazz'), constellation(FILMS, null, 'Films'),
        ])
        vi.mocked(listPinnedNotes).mockReset().mockResolvedValue([])
        vi.mocked(listNotes).mockReset().mockImplementation((_cursor, _signal, ids = []) => Promise.resolve(ids.length === 0
            ? {items: [note('a', 'Bowie'), note('b', 'Noir')], nextCursor: null, total: 2, allTotal: 2}
            : {items: [note('a', 'Bowie')], nextCursor: null, total: 1, allTotal: 2}))
    })

    it('reads the filter from the URL, shows its chips and counts the filtered list of all notes', async () => {
        renderPage(`?constellation=${MUSIC}`)

        expect(await screen.findByRole('button', {name: 'Remove Music'})).toBeInTheDocument()
        expect(await screen.findByText('1 of 2')).toBeInTheDocument()
        expect(lastFilter()).toEqual([MUSIC])
    })

    it('removes one constellation with its cross and all of them with Clear, reloading each time', async () => {
        renderPage(`?constellation=${MUSIC}&constellation=${FILMS}`)
        await userEvent.click(await screen.findByRole('button', {name: 'Remove Music'}))
        await waitFor(() => expect(lastFilter()).toEqual([FILMS]))
        expect(location).toBe(`?constellation=${FILMS}`)

        const bar = await screen.findByLabelText('Constellation filter')
        await userEvent.click(within(bar).getByRole('button', {name: 'Clear'}))
        await waitFor(() => expect(lastFilter()).toEqual([]))
        expect(screen.queryByLabelText('Constellation filter')).not.toBeInTheDocument()
        expect(await screen.findByRole('button', {name: /^Noir/})).toBeInTheDocument()
    })

    it('adds a picked constellation, and an ancestor takes the place of its chosen descendants', async () => {
        renderPage(`?constellation=${JAZZ}`)
        await screen.findByRole('button', {name: 'Remove Jazz'})

        await userEvent.click(screen.getByRole('button', {name: 'Filter by constellation'}))
        await userEvent.type(screen.getByRole('textbox', {name: 'Find a constellation'}), 'Music')
        await userEvent.click(screen.getByRole('button', {name: 'Show Music'}))

        await waitFor(() => expect(lastFilter()).toEqual([MUSIC]))
        expect(location).toBe(`?constellation=${MUSIC}`)
        expect(screen.queryByRole('textbox', {name: 'Find a constellation'})).not.toBeInTheDocument()
    })

    it('says that the filter found nothing and offers to clear it', async () => {
        vi.mocked(listNotes).mockImplementation((_cursor, _signal, ids = []) => Promise.resolve(ids.length === 0
            ? {items: [note('b', 'Noir')], nextCursor: null, total: 1, allTotal: 1}
            : {items: [], nextCursor: null, total: 0, allTotal: 1}))
        renderPage(`?constellation=${FILMS}`)

        expect(await screen.findByText('No notes in these constellations')).toBeInTheDocument()
        expect(screen.getByText('0 of 1')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: 'Clear filter'}))
        expect(await screen.findByRole('button', {name: /^Noir/})).toBeInTheDocument()
    })

    it('never sends what is not a uuid, and drops a constellation the tree does not have', async () => {
        const gone = id(99)
        renderPage(`?constellation=music&constellation=${gone}&constellation=${FILMS}`)

        await waitFor(() => expect(location).toBe(`?constellation=${FILMS}`))
        await waitFor(() => expect(lastFilter()).toEqual([FILMS]))
        for (const call of vi.mocked(listNotes).mock.calls) expect(call[2]).not.toContain('music')
    })

    it('shows only the pinned notes of the filter in the Pinned group', async () => {
        vi.mocked(listPinnedNotes).mockImplementation((_signal, ids = []) =>
            Promise.resolve(ids.length === 0 ? [note('p1', 'Pinned film'), note('p2', 'Pinned song')] : [note('p2', 'Pinned song')]))
        renderPage(`?constellation=${MUSIC}`)

        expect(await screen.findByRole('button', {name: /^Pinned song/})).toBeInTheDocument()
        expect(screen.getByText('Pinned')).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: /^Pinned film/})).not.toBeInTheDocument()
        expect(vi.mocked(listPinnedNotes)).toHaveBeenCalledWith(expect.any(AbortSignal), [MUSIC])
    })

    it('counts a note deleted here out of both the filtered list and all notes', async () => {
        vi.mocked(deleteNote).mockResolvedValue(undefined)
        // the reload that follows the delete never answers, so the counts are the page's own
        vi.mocked(listNotes).mockReset()
            .mockResolvedValueOnce({items: [note('a', 'Bowie')], nextCursor: null, total: 1, allTotal: 2})
            .mockReturnValue(new Promise(() => undefined))
        renderPage(`?constellation=${MUSIC}`)
        expect(await screen.findByText('1 of 2')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', {name: 'Actions for Bowie'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))
        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))

        expect(await screen.findByText('0 of 1')).toBeInTheDocument()
    })

    it('turns the filter button off at the service limit of 50 constellations', async () => {
        const many = Array.from({length: 50}, (_, n) => id(100 + n))
        vi.mocked(listConstellations).mockResolvedValue(many.map((cid, n) => constellation(cid, null, `C${n}`)))
        renderPage(`?${many.map((cid) => `constellation=${cid}`).join('&')}`)

        const button = await screen.findByRole('button', {name: 'Up to 50 constellations'})
        expect(button).toBeDisabled()
    })

    it('has no filter button for a user without constellations', async () => {
        vi.mocked(listConstellations).mockResolvedValue([])
        renderPage()

        await screen.findByRole('button', {name: /^Bowie/})
        await waitFor(() => expect(listConstellations).toHaveBeenCalled())
        expect(screen.queryByRole('button', {name: 'Filter by constellation'})).not.toBeInTheDocument()
    })

    it('keeps the filter, with unnamed chips, when the tree does not load', async () => {
        vi.mocked(listConstellations).mockRejectedValue(new Error('offline'))
        renderPage(`?constellation=${MUSIC}`)

        await screen.findByText('1 of 2')
        expect(screen.getByRole('button', {name: 'Remove Constellation'})).toBeInTheDocument()
        expect(location).toBe(`?constellation=${MUSIC}`)
        expect(lastFilter()).toEqual([MUSIC])
        expect(screen.queryByRole('button', {name: 'Filter by constellation'})).not.toBeInTheDocument()
    })

    it('moves a row pinned under a filter into the Pinned group at once', async () => {
        vi.mocked(pinNote).mockResolvedValue(note('a', 'Bowie'))
        // after the pin, the filtered pinned list never answers again: the group shows the pin on its own
        vi.mocked(listPinnedNotes).mockResolvedValueOnce([]).mockResolvedValueOnce([])
            .mockReturnValue(new Promise(() => undefined))
        renderPage(`?constellation=${MUSIC}`)
        await screen.findByText('1 of 2')

        await userEvent.click(screen.getByRole('button', {name: 'Actions for Bowie'}))
        await userEvent.click(screen.getByRole('menuitem', {name: 'Pin'}))

        expect(await screen.findByText('Pinned')).toBeInTheDocument()
        expect(screen.getAllByRole('button', {name: /^Bowie/})).toHaveLength(1)
    })
})
