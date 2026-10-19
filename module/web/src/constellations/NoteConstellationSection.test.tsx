import {render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
    addNoteConstellation,
    type Constellation,
    ConstellationApiError,
    createConstellation,
    listConstellations,
    listNoteConstellations,
    type NoteMembership,
    removeNoteConstellation,
    setMainNoteConstellation,
} from './constellationApi'
import {NoteConstellationSection} from './NoteConstellationSection'

vi.mock('./constellationApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./constellationApi')>()
    return {
        ...actual,
        listConstellations: vi.fn(),
        listNoteConstellations: vi.fn(),
        addNoteConstellation: vi.fn(),
        setMainNoteConstellation: vi.fn(),
        removeNoteConstellation: vi.fn(),
        createConstellation: vi.fn(),
    }
})

function node(id: string, parentId: string | null, name: string): Constellation {
    return {id, parentId, name, hue: 264, lightness: parentId ? 'LIGHT' : 'BASE', noteCount: 0, ownNoteCount: 0}
}

const TREE = [node('music', null, 'Music'), node('jazz', 'music', 'Jazz'), node('films', null, 'Films')]

const place = (constellationId: string, main: boolean): NoteMembership => ({constellationId, main})

async function renderSection(places: NoteMembership[], tree: Constellation[] = TREE) {
    vi.mocked(listConstellations).mockResolvedValue(tree)
    vi.mocked(listNoteConstellations).mockResolvedValue(places)
    render(<NoteConstellationSection noteId="n1"/>)
    await screen.findByRole('button', {name: /^\+ Add/})
}

describe('NoteConstellationSection', () => {
    beforeEach(() => vi.clearAllMocks())

    it('places a note without places through the tree picker', async () => {
        await renderSection([])
        vi.mocked(addNoteConstellation).mockResolvedValue([place('jazz', true)])

        expect(screen.getByText('Not in a constellation yet.')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: '+ Add'}))
        await userEvent.click(screen.getByRole('button', {name: /^Music/}))
        await userEvent.click(screen.getByRole('button', {name: /^Jazz/}))
        await userEvent.click(screen.getByRole('button', {name: 'Add to Jazz'}))

        expect(addNoteConstellation).toHaveBeenCalledWith('n1', 'jazz')
        const path = await screen.findByRole('button', {name: /Music ›\s*Jazz/})
        // A single place leaves nothing to choose the main place from.
        expect(path).toBeDisabled()
        expect(screen.queryByRole('textbox', {name: 'Add this note to…'})).not.toBeInTheDocument()
    })

    it('shows the other places as removable chips without a label and no way to promote them', async () => {
        await renderSection([place('jazz', true), place('films', false)])
        vi.mocked(removeNoteConstellation).mockResolvedValue([place('jazz', true)])

        expect(screen.queryByText('Also in')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Films'})).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: 'Remove Films'}))

        expect(removeNoteConstellation).toHaveBeenCalledWith('n1', 'films')
        await waitFor(() => expect(screen.queryByText('Films')).not.toBeInTheDocument())
    })

    it('chooses the main place among the note\'s own places', async () => {
        await renderSection([place('jazz', true), place('films', false)])
        vi.mocked(setMainNoteConstellation).mockResolvedValue([place('films', true), place('jazz', false)])

        await userEvent.click(screen.getByRole('button', {name: /Music ›\s*Jazz/}))
        const choice = screen.getByRole('list', {name: 'Make main'})
        expect(within(choice).getAllByRole('button').map((button) => button.textContent)).toEqual(['Films'])
        await userEvent.click(within(choice).getByRole('button', {name: 'Films'}))

        expect(setMainNoteConstellation).toHaveBeenCalledWith('n1', 'films', false)
        expect(await screen.findByRole('button', {name: 'Remove Jazz'})).toBeInTheDocument()
        expect(screen.queryByRole('list', {name: 'Make main'})).not.toBeInTheDocument()
    })

    it('removes the main place with its ×', async () => {
        await renderSection([place('jazz', true)])
        vi.mocked(removeNoteConstellation).mockResolvedValue([])

        await userEvent.click(screen.getByRole('button', {name: 'Remove from Jazz'}))

        expect(removeNoteConstellation).toHaveBeenCalledWith('n1', 'jazz')
        expect(await screen.findByText('Not in a constellation yet.')).toBeInTheDocument()
    })

    it('says so when the picked place is already the note\'s', async () => {
        await renderSection([place('jazz', true), place('films', false)])

        await userEvent.click(screen.getByRole('button', {name: '+ Add constellation'}))
        await userEvent.click(screen.getByRole('button', {name: /^Films/}))
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

        await userEvent.click(screen.getByRole('button', {name: '+ Add'}))
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

        await userEvent.click(screen.getByRole('button', {name: '+ Add'}))
        await userEvent.click(screen.getByRole('button', {name: '+ New constellation'}))
        await userEvent.type(screen.getByRole('textbox', {name: 'New constellation'}), 'Books{Enter}')

        expect(await screen.findByRole('button', {name: 'Add to Books'})).toBeEnabled()
    })

    it('explains a refusal and a place deleted meanwhile', async () => {
        await renderSection([place('jazz', true), place('films', false)])
        vi.mocked(removeNoteConstellation).mockRejectedValue(new ConstellationApiError('http', 'gone', 404))

        await userEvent.click(screen.getByRole('button', {name: 'Remove Films'}))

        expect(await screen.findByRole('alert')).toHaveTextContent('This note or constellation no longer exists.')
    })

    it('offers a retry when the places cannot be loaded', async () => {
        vi.mocked(listConstellations).mockResolvedValue(TREE)
        vi.mocked(listNoteConstellations).mockRejectedValueOnce(new ConstellationApiError('transport', 'down'))
            .mockResolvedValue([place('films', true)])
        render(<NoteConstellationSection noteId="n1"/>)

        await userEvent.click(await screen.findByRole('button', {name: 'Retry'}))

        expect(await screen.findByRole('button', {name: /^Films/})).toBeInTheDocument()
    })
})
