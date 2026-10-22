import {act, render, screen, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {getSky, type Sky} from '../constellations/constellationApi'
import {getNote, notifyNotesChanged} from '../notes/noteApi'
import {skyMemory} from './skyMemory'
import {SkyPage} from './SkyPage'

vi.mock('../constellations/constellationApi', async (importOriginal) => ({
    ...await importOriginal<typeof import('../constellations/constellationApi')>(),
    getSky: vi.fn(),
}))
vi.mock('../notes/noteApi', async (importOriginal) => ({
    ...await importOriginal<typeof import('../notes/noteApi')>(),
    getNote: vi.fn(),
}))
// The note's sections have their own tests; here only what the sky hands them matters.
vi.mock('../notes/NoteDetailsSections', () => ({
    NoteDetailsSections: ({note, onOpenNote, onPlaceChanged}: {
        note: { id: string }
        onOpenNote: (id: string) => void
        onPlaceChanged: () => void
    }) => <div data-testid="note-sections">
        <span>Sections of {note.id}</span>
        <button type="button" onClick={() => onOpenNote('low')}>Open sub-note</button>
        <button type="button" onClick={onPlaceChanged}>Change place</button>
    </div>,
}))

const mockedSky = vi.mocked(getSky)
const mockedNote = vi.mocked(getNote)

const MUSIC = {id: 'music', parentId: null, name: 'Music', hue: 264, lightness: 'BASE' as const, noteCount: 2, ownNoteCount: 2}
const FILMS = {id: 'films', parentId: null, name: 'Films', hue: 22, lightness: 'BASE' as const, noteCount: 0, ownNoteCount: 0}
const SKY: Sky = {
    constellations: [MUSIC, FILMS],
    notes: [
        {id: 'bowie', title: 'Bowie', parentNoteId: null, createdAt: '2026-10-20T10:00:00Z',
            memberships: [{constellationId: 'music', main: true}]},
        {id: 'low', title: 'Low', parentNoteId: 'bowie', createdAt: '2026-10-20T11:00:00Z', memberships: []},
        {id: 'loose', title: 'Loose thought', parentNoteId: null, createdAt: '2026-10-20T12:00:00Z', memberships: []},
    ],
}

function renderSky() {
    return render(<MemoryRouter initialEntries={['/sky']}><Routes>
        <Route path="/sky" element={<SkyPage/>}/>
        <Route path="/notes/:noteId" element={<div data-testid="note-route"/>}/>
    </Routes></MemoryRouter>)
}

const star = (name: string) => screen.findByRole('button', {name})

describe('SkyPage', () => {
    beforeEach(() => {
        skyMemory.screen = null
        skyMemory.canvas = null
        localStorage.clear()
        mockedSky.mockReset().mockResolvedValue(SKY)
        mockedNote.mockReset().mockImplementation(async (id) => ({
            id, source: 'CHAT_SUMMARY', status: 'READY', title: id, content: `# ${id}\n\nThe **first** line of ${id}.`,
        }))
    })
    afterEach(() => vi.useRealTimers())

    it('says what a sky is for while there is nothing to draw', async () => {
        mockedSky.mockResolvedValue({constellations: [], notes: []})
        renderSky()

        expect(await screen.findByText('Two stars are not a sky yet')).toBeInTheDocument()
    })

    it('shows the constellations alone in Skeleton until there are notes, and Full stays off', async () => {
        mockedSky.mockResolvedValue({constellations: [MUSIC], notes: []})
        renderSky()

        expect(await screen.findByRole('button', {name: 'Focus on Music'})).toBeInTheDocument()
        expect(screen.getByText(/Notes you keep appear as stars/)).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Full'})).toBeDisabled()
        expect(screen.getByRole('button', {name: 'Skeleton'})).toHaveAttribute('aria-pressed', 'true')
    })

    it('offers Retry when the sky does not load', async () => {
        mockedSky.mockRejectedValueOnce(new Error('down'))
        renderSky()

        await userEvent.click(await screen.findByRole('button', {name: 'Retry'}))

        expect(await star('Bowie')).toBeInTheDocument()
        expect(mockedSky).toHaveBeenCalledTimes(2)
    })

    it('opens a star in the panel with the start of its text, its sections and Open note', async () => {
        renderSky()

        await userEvent.click(await star('Bowie'))

        const panel = screen.getByRole('complementary', {name: 'Note'})
        expect(within(panel).getByRole('heading', {name: 'Bowie'})).toBeInTheDocument()
        expect(await within(panel).findByText('bowie The first line of bowie.')).toBeInTheDocument()
        expect(within(panel).getByText('Sections of bowie')).toBeInTheDocument()

        await userEvent.click(within(panel).getByRole('button', {name: 'Open note'}))
        expect(screen.getByTestId('note-route')).toBeInTheDocument()
    })

    it('opens a sub-note in the same panel and redraws the sky after a change of place', async () => {
        renderSky()
        await userEvent.click(await star('Bowie'))
        const panel = screen.getByRole('complementary', {name: 'Note'})

        await userEvent.click(await within(panel).findByRole('button', {name: 'Open sub-note'}))
        expect(await within(panel).findByRole('heading', {name: 'Low'})).toBeInTheDocument()

        await userEvent.click(await within(panel).findByRole('button', {name: 'Change place'}))
        expect(mockedSky).toHaveBeenCalledTimes(2)
    })

    it('focuses a constellation by click and leaves Focus through YOU', async () => {
        renderSky()
        await userEvent.click(await screen.findByRole('button', {name: 'Skeleton'}))
        expect(screen.queryByRole('button', {name: 'Bowie'})).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', {name: 'Focus on Music'}))

        expect(await star('Bowie')).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Low'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Loose thought'})).not.toBeInTheDocument()
        expect(screen.getByRole('group', {name: 'Depth'})).toBeInTheDocument()

        const exits = screen.getAllByRole('button', {name: 'Exit focus'})
        // the footer button and YOU on the sky
        expect(exits).toHaveLength(2)
        await userEvent.click(exits.find((element) => element.tagName.toLowerCase() === 'g')!)

        expect(screen.queryByRole('group', {name: 'Depth'})).not.toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Focus'})).toBeEnabled()
    })

    it('dims everything outside the picked branch and names it with a count', async () => {
        renderSky()
        await userEvent.click(await screen.findByRole('button', {name: 'Filter by constellation'}))
        await userEvent.click(screen.getByRole('button', {name: /^Music/}))
        await userEvent.click(screen.getByRole('button', {name: 'Show Music'}))

        const chip = screen.getByRole('button', {name: /2 of 3 · Music/})
        expect(chip).toHaveAttribute('title', 'Show every constellation')
        // a dimmed star is not a target
        expect(screen.queryByRole('button', {name: 'Loose thought'})).not.toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Bowie'})).toBeInTheDocument()

        await userEvent.click(chip)
        expect(screen.getByRole('button', {name: 'Loose thought'})).toBeInTheDocument()
    })

    it('shows a note found in the filter: its main constellation, its star in Full and its panel', async () => {
        renderSky()
        await userEvent.click(await screen.findByRole('button', {name: 'Skeleton'}))
        await userEvent.click(screen.getByRole('button', {name: 'Filter by constellation'}))

        // a sub-note lives where its top note lives
        await userEvent.type(screen.getByRole('textbox', {name: 'Find a constellation or a note'}), 'low')
        await userEvent.click(screen.getByRole('button', {name: 'Show Low'}))

        expect(screen.getByRole('button', {name: /· Music/})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Full'})).toHaveAttribute('aria-pressed', 'true')
        const panel = screen.getByRole('complementary', {name: 'Note'})
        expect(within(panel).getByRole('heading', {name: 'Low'})).toBeInTheDocument()
    })

    it('shows the whole sky for a note found in the filter without a constellation', async () => {
        renderSky()
        await userEvent.click(await screen.findByRole('button', {name: 'Filter by constellation'}))
        await userEvent.click(screen.getByRole('button', {name: /^Music/}))
        await userEvent.click(screen.getByRole('button', {name: 'Show Music'}))

        await userEvent.click(screen.getByRole('button', {name: 'Filter by constellation'}))
        await userEvent.type(screen.getByRole('textbox', {name: 'Find a constellation or a note'}), 'loose')
        await userEvent.click(screen.getByRole('button', {name: 'Show Loose thought'}))

        expect(screen.queryByRole('button', {name: /· Music/})).not.toBeInTheDocument()
        expect(within(screen.getByRole('complementary', {name: 'Note'}))
            .getByRole('heading', {name: 'Loose thought'})).toBeInTheDocument()
    })

    it('opens the settings in the panel slot instead of a star, and a change is remembered', async () => {
        renderSky()
        await userEvent.click(await star('Bowie'))
        await userEvent.click(screen.getByRole('button', {name: 'Sky settings'}))

        expect(screen.queryByRole('complementary', {name: 'Note'})).not.toBeInTheDocument()
        const sheet = screen.getByRole('complementary', {name: 'Sky settings'})
        await userEvent.click(within(sheet).getByRole('switch', {name: /Mix colours/}))

        expect(JSON.parse(localStorage.getItem('uliss.sky')!).values.mixColours).toBe(true)
    })

    it('comes back as it was left: the focus and the open star', async () => {
        const first = renderSky()
        await userEvent.click(await screen.findByRole('button', {name: 'Focus on Music'}))
        await userEvent.click(await star('Bowie'))
        first.unmount()

        renderSky()

        expect(await screen.findByRole('complementary', {name: 'Note'})).toBeInTheDocument()
        expect(screen.getByRole('group', {name: 'Depth'})).toBeInTheDocument()
    })

    it('keeps the newest sky when an older load answers last', async () => {
        let firstLoad!: (sky: Sky) => void
        mockedSky.mockReturnValueOnce(new Promise((resolve) => {
            firstLoad = resolve
        }))
        const newer: Sky = {...SKY, notes: [...SKY.notes, {id: 'heroes', title: 'Heroes', parentNoteId: null,
            createdAt: '2026-10-21T09:00:00Z', memberships: []}]}
        mockedSky.mockResolvedValueOnce(newer)
        renderSky()

        // a note written meanwhile reloads the sky; that newer answer lands first
        act(() => notifyNotesChanged())
        expect(await star('Heroes')).toBeInTheDocument()

        await act(async () => firstLoad(SKY))
        expect(screen.getByRole('button', {name: 'Heroes'})).toBeInTheDocument()
    })
})
