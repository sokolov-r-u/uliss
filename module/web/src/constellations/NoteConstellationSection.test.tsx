import {render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {notifyNotesChanged} from '../notes/noteApi'
import {
    addNoteConstellation,
    type Constellation,
    ConstellationApiError,
    createConstellation,
    getNotePlace,
    getSky,
    listConstellations,
    moveNoteOut,
    moveNoteUnder,
    type NoteMembership,
    removeNoteConstellation,
    setMainNoteConstellation,
    type SkyStar,
} from './constellationApi'
import {NoteConstellationSection} from './NoteConstellationSection'

vi.mock('./constellationApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./constellationApi')>()
    return {
        ...actual,
        listConstellations: vi.fn(),
        getNotePlace: vi.fn(),
        addNoteConstellation: vi.fn(),
        setMainNoteConstellation: vi.fn(),
        removeNoteConstellation: vi.fn(),
        createConstellation: vi.fn(),
        moveNoteUnder: vi.fn(),
        moveNoteOut: vi.fn(),
        getSky: vi.fn(),
    }
})
vi.mock('../notes/noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../notes/noteApi')>()
    return {...actual, notifyNotesChanged: vi.fn()}
})

function node(id: string, parentId: string | null, name: string): Constellation {
    return {id, parentId, name, hue: 264, lightness: parentId ? 'LIGHT' : 'BASE', noteCount: 0, ownNoteCount: 0}
}

const TREE = [node('music', null, 'Music'), node('jazz', 'music', 'Jazz'), node('films', null, 'Films')]

const place = (constellationId: string, main: boolean): NoteMembership => ({constellationId, main})

const star = (id: string, title: string, parentNoteId: string | null = null,
              memberships: NoteMembership[] = []): SkyStar =>
    ({id, title, parentNoteId, createdAt: '2026-10-20T10:00:00Z', memberships})

async function renderSection(places: NoteMembership[], tree: Constellation[] = TREE) {
    vi.mocked(listConstellations).mockResolvedValue(tree)
    vi.mocked(getNotePlace).mockResolvedValue({ancestors: [], constellations: places})
    vi.mocked(getSky).mockResolvedValue({constellations: tree, notes: []})
    render(<NoteConstellationSection noteId="n1"/>)
    await screen.findByRole('button', {name: 'Add to…'})
}

async function openPicker() {
    await userEvent.click(screen.getByRole('button', {name: 'Add to…'}))
    await screen.findByRole('textbox', {name: /this note to…/})
}

function pickerBlock(): HTMLElement {
    const block = document.querySelector<HTMLElement>('.note-places-picker')
    if (!block) throw new Error('the picker is closed')
    return block
}

describe('NoteConstellationSection', () => {
    beforeEach(() => vi.clearAllMocks())

    it('places a note without places through the tree picker', async () => {
        await renderSection([])
        vi.mocked(addNoteConstellation).mockResolvedValue([place('jazz', true)])

        expect(screen.getByText('Not in a constellation yet.')).toBeInTheDocument()
        await openPicker()
        await userEvent.click(screen.getByRole('button', {name: /^Music/}))
        await userEvent.click(screen.getByRole('button', {name: /^Jazz/}))
        await userEvent.click(screen.getByRole('button', {name: 'Add to Jazz'}))

        expect(addNoteConstellation).toHaveBeenCalledWith('n1', 'jazz')
        expect(await screen.findByRole('group', {name: 'Music / Jazz'})).toBeInTheDocument()
        // A single place is not marked main and offers nothing to choose.
        expect(screen.queryByText('Main')).not.toBeInTheDocument()
        expect(screen.queryByRole('textbox', {name: 'Add this note to…'})).not.toBeInTheDocument()
    })

    it('tells its host about every stored change of place, and not about a refused one', async () => {
        const onChanged = vi.fn()
        vi.mocked(listConstellations).mockResolvedValue(TREE)
        vi.mocked(getNotePlace).mockResolvedValue({ancestors: [], constellations: [place('jazz', true), place('films', false)]})
        render(<NoteConstellationSection noteId="n1" onChanged={onChanged}/>)
        await screen.findByRole('button', {name: 'Add to…'})

        vi.mocked(removeNoteConstellation).mockRejectedValueOnce(new ConstellationApiError('http', 'gone', 404))
        await userEvent.click(screen.getByRole('button', {name: 'Out of Films'}))
        await userEvent.click(screen.getByRole('button', {name: 'Remove'}))
        expect(await screen.findByRole('alert')).toHaveTextContent('This note or constellation no longer exists.')
        expect(onChanged).not.toHaveBeenCalled()

        vi.mocked(removeNoteConstellation).mockResolvedValueOnce([place('jazz', true)])
        await userEvent.click(screen.getByRole('button', {name: 'Remove'}))
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('makes another place main by a click on its path', async () => {
        await renderSection([place('jazz', true), place('films', false)])
        vi.mocked(setMainNoteConstellation).mockResolvedValue([place('films', true), place('jazz', false)])

        expect(within(screen.getByRole('group', {name: 'Music / Jazz'})).getByText('Main')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: 'Films'}))

        expect(setMainNoteConstellation).toHaveBeenCalledWith('n1', 'films', false)
        expect(await within(screen.getByRole('group', {name: 'Films'})).findByText('Main')).toBeInTheDocument()
    })

    it('moves a note up its line with a cross after a confirmation', async () => {
        await renderSection([place('jazz', true), place('films', false)])
        vi.mocked(addNoteConstellation).mockResolvedValue([place('music', true), place('films', false)])

        await userEvent.click(screen.getByRole('button', {name: 'Out of Jazz'}))
        const dialog = screen.getByRole('dialog', {name: 'Move to Music?'})
        expect(dialog).toHaveTextContent('It leaves Music / Jazz. It stays in Films.')
        await userEvent.click(within(dialog).getByRole('button', {name: 'Move'}))

        expect(addNoteConstellation).toHaveBeenCalledWith('n1', 'music')
        expect(await screen.findByRole('group', {name: 'Music'})).toBeInTheDocument()
    })

    it('removes the last place off its root after a confirmation, and Cancel changes nothing', async () => {
        await renderSection([place('jazz', true)])
        vi.mocked(removeNoteConstellation).mockResolvedValue([])

        await userEvent.click(screen.getByRole('button', {name: 'Out of Music'}))
        await userEvent.click(screen.getByRole('button', {name: 'Cancel'}))
        expect(removeNoteConstellation).not.toHaveBeenCalled()

        await userEvent.click(screen.getByRole('button', {name: 'Out of Music'}))
        expect(screen.getByRole('dialog', {name: 'Remove from Music / Jazz?'}))
            .toHaveTextContent('The note will have no place left.')
        await userEvent.click(screen.getByRole('button', {name: 'Remove'}))

        expect(removeNoteConstellation).toHaveBeenCalledWith('n1', 'jazz')
        expect(await screen.findByText('Not in a constellation yet.')).toBeInTheDocument()
    })

    it('says so when the picked place is already the note\'s', async () => {
        await renderSection([place('jazz', true), place('films', false)])

        await openPicker()
        // the picker row, not the path of the secondary place
        await userEvent.click(within(pickerBlock()).getByRole('button', {name: /^Films/}))
        await userEvent.click(screen.getByRole('button', {name: 'Add to Films'}))

        expect(addNoteConstellation).not.toHaveBeenCalled()
        expect(screen.getByRole('alert')).toHaveTextContent('The note is already in Films.')
        expect(screen.getByRole('button', {name: 'Add to Films'})).toBeInTheDocument()
    })

    it('creates a sub-constellation in the picker and places the note only on the action', async () => {
        await renderSection([])
        const bebop = node('bebop', 'jazz', 'Bebop')
        vi.mocked(createConstellation).mockResolvedValue(bebop)
        vi.mocked(listConstellations).mockResolvedValue([...TREE, bebop])
        vi.mocked(addNoteConstellation).mockResolvedValue([place('bebop', true)])

        await openPicker()
        await userEvent.click(screen.getByRole('button', {name: /^Music/}))
        await userEvent.click(screen.getByRole('button', {name: /^Jazz/}))
        await userEvent.click(screen.getByRole('button', {name: '+ New in Jazz'}))
        await userEvent.type(screen.getByRole('textbox', {name: 'New constellation in Jazz'}), 'Bebop{Enter}')

        expect(createConstellation).toHaveBeenCalledWith('Bebop', 'jazz')
        expect(addNoteConstellation).not.toHaveBeenCalled()
        await userEvent.click(await screen.findByRole('button', {name: 'Add to Bebop'}))
        expect(addNoteConstellation).toHaveBeenCalledWith('n1', 'bebop')
    })

    it('keeps a created branch selectable when the tree cannot be reloaded', async () => {
        await renderSection([])
        vi.mocked(createConstellation).mockResolvedValue(node('books', null, 'Books'))
        vi.mocked(listConstellations).mockRejectedValue(new ConstellationApiError('transport', 'down'))

        await openPicker()
        await userEvent.click(screen.getByRole('button', {name: '+ New constellation'}))
        await userEvent.type(screen.getByRole('textbox', {name: 'New constellation'}), 'Books{Enter}')

        expect(await screen.findByRole('button', {name: 'Add to Books'})).toBeEnabled()
    })

    it('offers a retry when the places cannot be loaded', async () => {
        vi.mocked(listConstellations).mockResolvedValue(TREE)
        vi.mocked(getNotePlace).mockRejectedValueOnce(new ConstellationApiError('transport', 'down'))
            .mockResolvedValue({ancestors: [], constellations: [place('films', true)]})
        render(<NoteConstellationSection noteId="n1"/>)

        await userEvent.click(await screen.findByRole('button', {name: 'Retry'}))

        expect(await screen.findByRole('group', {name: 'Films'})).toBeInTheDocument()
    })

    it('moves a top note under a picked note, which is never the note itself', async () => {
        vi.mocked(listConstellations).mockResolvedValue(TREE)
        vi.mocked(getNotePlace).mockResolvedValue({ancestors: [], constellations: [place('films', true)]})
        vi.mocked(getSky).mockResolvedValue({constellations: TREE, notes: [
            star('bowie', 'Bowie', null, [place('music', true)]),
            star('n1', 'Low', null, [place('films', true)]),
            star('sub', 'Bowie live', 'n1'),
        ]})
        vi.mocked(moveNoteUnder).mockResolvedValue(
            {ancestors: [{id: 'bowie', title: 'Bowie'}], constellations: [place('music', true)]})
        render(<MemoryRouter><NoteConstellationSection noteId="n1" noteTitle="Low"/></MemoryRouter>)

        await userEvent.click(await screen.findByRole('button', {name: 'Add to…'}))
        await userEvent.type(await screen.findByRole('textbox', {name: 'Add this note to…'}), 'bo')
        // the note and its sub-notes are hidden: the only match is Bowie
        expect(screen.getByText('1 / 1')).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: /^Bowie live/})).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: 'Move under Bowie'}))
        expect(screen.getByRole('dialog', {name: 'Move under “Bowie”?'}))
            .toHaveTextContent('It leaves Films and lives where “Bowie” lives.')
        await userEvent.click(screen.getByRole('button', {name: 'Move'}))

        expect(moveNoteUnder).toHaveBeenCalledWith('n1', 'bowie')
        expect(await screen.findByRole('link', {name: 'Bowie'})).toBeInTheDocument()
        expect(notifyNotesChanged).toHaveBeenCalled()
    })

    it('offers Retry when the notes do not load', async () => {
        await renderSection([])
        vi.mocked(getSky).mockRejectedValueOnce(new ConstellationApiError('transport', 'down'))
            .mockResolvedValueOnce({constellations: TREE, notes: [star('x', 'Xtra')]})

        await userEvent.click(screen.getByRole('button', {name: 'Add to…'}))
        await userEvent.click(await screen.findByRole('button', {name: 'Retry'}))
        await userEvent.type(await screen.findByRole('textbox', {name: 'Add this note to…'}), 'xt')

        expect(screen.getByRole('button', {name: /^Xtra/})).toBeInTheDocument()
    })

    describe('sub-notes', () => {
        const SUB_TREE = [node('music', null, 'Music'), node('rock', 'music', 'Rock'), node('films', null, 'Films')]

        async function renderSubNote() {
            vi.mocked(listConstellations).mockResolvedValue(SUB_TREE)
            vi.mocked(getNotePlace).mockResolvedValue({
                ancestors: [{id: 'bowie', title: 'Bowie'}, {id: 'low', title: 'Low'}],
                constellations: [place('rock', true), place('films', false)],
            })
            render(<MemoryRouter><NoteConstellationSection noteId="n1" noteTitle="Warszawa"/></MemoryRouter>)
            await screen.findByRole('button', {name: 'Add to…'})
        }

        it('shows the main line of its top note and its parent notes, each with a cross', async () => {
            await renderSubNote()

            const path = screen.getByRole('group', {name: 'Place'})
            expect(within(path).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
                .toEqual(['Out of Music', 'Out of Rock', 'Out of “Bowie”', 'Out of “Low”'])
            expect(screen.getByRole('link', {name: 'Bowie'})).toHaveAttribute('href', '/notes/bowie')
            expect(screen.getByText('Warszawa')).toBeInTheDocument()
            expect(screen.queryByRole('group', {name: 'Films'})).not.toBeInTheDocument()
        })

        it('moves under the parent note above with a cross', async () => {
            await renderSubNote()
            vi.mocked(moveNoteUnder).mockResolvedValue(
                {ancestors: [{id: 'bowie', title: 'Bowie'}], constellations: [place('rock', true)]})

            await userEvent.click(screen.getByRole('button', {name: 'Out of “Low”'}))
            expect(screen.getByRole('dialog', {name: 'Move under “Bowie”?'}))
                .toHaveTextContent('It leaves “Low” and lives where “Bowie” lives.')
            await userEvent.click(screen.getByRole('button', {name: 'Move'}))

            expect(moveNoteUnder).toHaveBeenCalledWith('n1', 'bowie')
        })

        it('leaves the top note into its main constellation, naming the places it loses', async () => {
            await renderSubNote()
            vi.mocked(moveNoteOut).mockResolvedValue({ancestors: [], constellations: [place('rock', true)]})

            await userEvent.click(screen.getByRole('button', {name: 'Out of “Bowie”'}))
            expect(screen.getByRole('dialog', {name: 'Move to Music / Rock?'})).toHaveTextContent(
                'It leaves “Low” and goes to Music / Rock only. It will no longer be in Films.')
            await userEvent.click(screen.getByRole('button', {name: 'Move'}))

            expect(moveNoteOut).toHaveBeenCalledWith('n1', 'rock')
            expect(await screen.findByRole('group', {name: 'Music / Rock'})).toBeInTheDocument()
            expect(notifyNotesChanged).toHaveBeenCalled()
        })

        it('moves out without a place off the root', async () => {
            await renderSubNote()
            vi.mocked(moveNoteOut).mockResolvedValue({ancestors: [], constellations: []})

            await userEvent.click(screen.getByRole('button', {name: 'Out of Music'}))
            await userEvent.click(within(screen.getByRole('dialog', {name: 'Move out of “Low”?'}))
                .getByRole('button', {name: 'Move'}))

            expect(moveNoteOut).toHaveBeenCalledWith('n1', null)
            expect(await screen.findByText('Not in a constellation yet.')).toBeInTheDocument()
        })

        it('moves out into a picked constellation, offering constellations only', async () => {
            await renderSubNote()
            vi.mocked(moveNoteOut).mockResolvedValue({ancestors: [], constellations: [place('films', true)]})

            await openPicker()
            expect(getSky).not.toHaveBeenCalled()
            await userEvent.click(within(pickerBlock()).getByRole('button', {name: /^Films/}))
            await userEvent.click(screen.getByRole('button', {name: 'Move to Films'}))
            await userEvent.click(screen.getByRole('button', {name: 'Move'}))

            expect(moveNoteOut).toHaveBeenCalledWith('n1', 'films')
            expect(await screen.findByRole('group', {name: 'Films'})).toBeInTheDocument()
        })

        it('explains a refused move inside the dialog', async () => {
            await renderSubNote()
            vi.mocked(moveNoteUnder).mockRejectedValue(
                new ConstellationApiError('http', 'cycle', 409, undefined, 'NOTE_MOVE_CYCLE'))

            await userEvent.click(screen.getByRole('button', {name: 'Out of “Low”'}))
            await userEvent.click(screen.getByRole('button', {name: 'Move'}))

            expect(await within(screen.getByRole('dialog')).findByRole('alert'))
                .toHaveTextContent('A note cannot go under itself or its own sub-notes.')
        })
    })
})
