import {render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
    type Constellation,
    ConstellationApiError,
    createConstellation,
    deleteConstellation,
    listConstellations,
    moveConstellation,
    updateConstellation,
} from './constellationApi'
import {ConstellationsPage} from './ConstellationsPage'

vi.mock('./constellationApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./constellationApi')>()
    return {
        ...actual,
        listConstellations: vi.fn(),
        createConstellation: vi.fn(),
        updateConstellation: vi.fn(),
        moveConstellation: vi.fn(),
        deleteConstellation: vi.fn(),
        getConstellationDeletion: vi.fn(async () => ({notesToMove: 0})),
    }
})

vi.mock('../notes/noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../notes/noteApi')>()
    return {
        ...actual,
        listNotesWithoutConstellation: vi.fn(async () => []),
        listConstellationNotes: vi.fn(async () => []),
    }
})

function node(id: string, parentId: string | null, name: string, extra: Partial<Constellation> = {}): Constellation {
    return {id, parentId, name, hue: 264, lightness: parentId ? 'LIGHT' : 'BASE', noteCount: 0, ownNoteCount: 0, ...extra}
}

const TREE = [
    node('music', null, 'Music'),
    node('jazz', 'music', 'Jazz'),
    node('miles', 'jazz', 'Miles', {lightness: 'PALE'}),
    node('films', null, 'Films', {hue: 22}),
]

function httpError(status: number, code?: string) {
    return new ConstellationApiError('http', `failed (${status})`, status, undefined, code)
}

async function renderPage(items: Constellation[] = TREE) {
    vi.mocked(listConstellations).mockResolvedValue(items)
    render(<MemoryRouter><ConstellationsPage/></MemoryRouter>)
}

async function openBranch(name: string) {
    await userEvent.click(await screen.findByRole('button', {name: new RegExp(`^${name}`)}))
    return screen.getByRole('complementary')
}

describe('ConstellationsPage', () => {
    beforeEach(() => {
        vi.mocked(listConstellations).mockReset()
        vi.mocked(createConstellation).mockReset()
        vi.mocked(updateConstellation).mockReset()
        vi.mocked(moveConstellation).mockReset()
        vi.mocked(deleteConstellation).mockReset()
    })

    it('offers to create the first constellation on an empty tree', async () => {
        await renderPage([])
        vi.mocked(createConstellation).mockResolvedValue(node('music', null, 'Music'))
        vi.mocked(listConstellations).mockResolvedValue([node('music', null, 'Music')])

        await userEvent.click(await screen.findByRole('button', {name: 'New constellation'}))
        const dialog = screen.getByRole('dialog', {name: 'New constellation'})
        await userEvent.type(within(dialog).getByRole('textbox'), '  Music ')
        await userEvent.click(within(dialog).getByRole('button', {name: 'Create'}))

        expect(createConstellation).toHaveBeenCalledWith('Music', null)
        expect(await screen.findByRole('complementary', {name: 'Constellation'})).toHaveTextContent('Music')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows the tree collapsed to its roots and unfolds a branch when it is opened', async () => {
        await renderPage()

        expect(await screen.findByText('2 roots · 4 in all')).toBeInTheDocument()
        expect(screen.queryByText('Jazz')).not.toBeInTheDocument()

        const panel = await openBranch('Music')

        expect(screen.getByText('Jazz')).toBeInTheDocument()
        expect(screen.queryByText('Miles')).not.toBeInTheDocument()
        expect(within(panel).getByText(/0 stars · 1 sub-constellation/)).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Collapse Music'})).toHaveAttribute('aria-expanded', 'true')
    })

    it('shows a sub-constellation with its path and the root it takes its colour from', async () => {
        await renderPage()
        await openBranch('Music')

        const panel = await openBranch('Jazz')

        expect(screen.getByRole('complementary', {name: 'Sub-constellation'})).toBe(panel)
        expect(within(panel).getByText(/Music ›/)).toBeInTheDocument()
        expect(within(panel).getByText('Colour comes from Music; this level chooses how light it sits.')).toBeInTheDocument()
    })

    it('keeps Save disabled for a blank name and shows a taken name in the dialog', async () => {
        await renderPage()
        const panel = await openBranch('Music')
        vi.mocked(updateConstellation).mockRejectedValue(httpError(409, 'CONSTELLATION_NAME_TAKEN'))

        await userEvent.click(within(panel).getByRole('button', {name: 'Rename'}))
        const dialog = screen.getByRole('dialog', {name: 'Rename constellation'})
        const field = within(dialog).getByRole('textbox')
        await userEvent.clear(field)
        expect(within(dialog).getByRole('button', {name: 'Save'})).toBeDisabled()

        await userEvent.type(field, 'films')
        await userEvent.click(within(dialog).getByRole('button', {name: 'Save'}))

        expect(updateConstellation).toHaveBeenCalledWith('music', {name: 'films'})
        expect(await within(dialog).findByText('“films” is already taken here. Pick another name.')).toBeInTheDocument()
    })

    it('creates a sub-constellation under the open branch', async () => {
        await renderPage()
        const panel = await openBranch('Films')
        vi.mocked(createConstellation).mockResolvedValue(node('noir', 'films', 'Noir'))
        vi.mocked(listConstellations).mockResolvedValue([...TREE, node('noir', 'films', 'Noir')])

        await userEvent.click(within(panel).getByRole('button', {name: '+ New sub-constellation'}))
        const dialog = screen.getByRole('dialog', {name: 'New sub-constellation in Films'})
        await userEvent.type(within(dialog).getByRole('textbox'), 'Noir{Enter}')

        expect(createConstellation).toHaveBeenCalledWith('Noir', 'films')
        expect(await screen.findByRole('button', {name: /^Noir/})).toBeInTheDocument()
    })

    it('recolours a root with a hue and a sub-constellation with a lightness step', async () => {
        await renderPage()
        vi.mocked(updateConstellation).mockResolvedValue(node('music', null, 'Music'))
        let panel = await openBranch('Music')

        await userEvent.click(within(panel).getByRole('button', {name: 'Change colour'}))
        await userEvent.click(within(panel).getByRole('radio', {name: 'Hue 22'}))
        await userEvent.click(within(panel).getByRole('button', {name: 'Save'}))
        expect(updateConstellation).toHaveBeenLastCalledWith('music', {hue: 22})

        panel = await openBranch('Jazz')
        await userEvent.click(within(panel).getByRole('button', {name: 'Change colour'}))
        expect(within(panel).queryByRole('radiogroup', {name: 'Palette'})).not.toBeInTheDocument()
        expect(within(panel).getByText(/Inherits from/)).toHaveTextContent('Inherits from Music')
        await userEvent.click(within(panel).getByRole('radio', {name: 'Deep'}))
        await userEvent.click(within(panel).getByRole('button', {name: 'Save'}))
        expect(updateConstellation).toHaveBeenLastCalledWith('jazz', {lightness: 'DEEP'})
    })

    it('moves a branch through a picker without the branch and its descendants', async () => {
        await renderPage()
        await openBranch('Music')
        const panel = await openBranch('Jazz')
        vi.mocked(moveConstellation).mockResolvedValue(node('jazz', null, 'Jazz'))

        await userEvent.click(within(panel).getByRole('button', {name: 'Move'}))
        const rows = within(panel).getAllByRole('listitem').map((row) => row.textContent)

        expect(rows[0]).toBe('Make it a root')
        expect(rows.some((text) => text?.startsWith('Jazz') || text?.startsWith('Miles'))).toBe(false)
        expect(rows.some((text) => text?.startsWith('Films'))).toBe(true)

        await userEvent.click(within(panel).getByRole('button', {name: 'Make it a root'}))
        expect(moveConstellation).toHaveBeenCalledWith('jazz', null)
    })

    it('does not offer to make a root a root', async () => {
        await renderPage()
        const panel = await openBranch('Films')

        await userEvent.click(within(panel).getByRole('button', {name: 'Move'}))

        expect(within(panel).queryByRole('button', {name: 'Make it a root'})).not.toBeInTheDocument()
    })

    it('explains a refused move in the panel', async () => {
        await renderPage()
        const panel = await openBranch('Music')
        vi.mocked(moveConstellation).mockRejectedValue(httpError(409, 'CONSTELLATION_NAME_TAKEN'))

        await userEvent.click(within(panel).getByRole('button', {name: 'Move'}))
        await userEvent.click(within(panel).getByRole('button', {name: /^Films/}))

        expect(await within(panel).findByRole('alert')).toHaveTextContent('“Music” is already taken here.')
    })

    it('keeps the panel and says so when the branch is gone', async () => {
        await renderPage()
        const panel = await openBranch('Music')
        vi.mocked(updateConstellation).mockRejectedValue(httpError(404))

        await userEvent.click(within(panel).getByRole('button', {name: 'Change colour'}))
        await userEvent.click(within(panel).getByRole('radio', {name: 'Hue 22'}))
        await userEvent.click(within(panel).getByRole('button', {name: 'Save'}))

        expect(await within(panel).findByRole('alert')).toHaveTextContent('This constellation no longer exists.')
        expect(listConstellations).toHaveBeenCalledTimes(1)
    })

    it('does not blame the name rule for a refused colour', async () => {
        await renderPage()
        const panel = await openBranch('Music')
        vi.mocked(updateConstellation).mockRejectedValue(httpError(400))

        await userEvent.click(within(panel).getByRole('button', {name: 'Change colour'}))
        await userEvent.click(within(panel).getByRole('radio', {name: 'Hue 22'}))
        await userEvent.click(within(panel).getByRole('button', {name: 'Save'}))

        expect(await within(panel).findByRole('alert')).toHaveTextContent('The tree changed since it was loaded.')
    })

    it('names the sub-constellations a delete takes with it and closes the panel after it', async () => {
        await renderPage()
        const panel = await openBranch('Music')
        vi.mocked(deleteConstellation).mockResolvedValue()
        vi.mocked(listConstellations).mockResolvedValue([node('films', null, 'Films', {hue: 22})])

        await userEvent.click(within(panel).getByRole('button', {name: 'Delete constellation'}))
        const dialog = screen.getByRole('dialog', {name: 'Delete “Music”?'})
        expect(await within(dialog).findByText('Its 2 sub-constellations go with it. Notes are never deleted with a constellation.'))
            .toBeInTheDocument()
        await userEvent.click(within(dialog).getByRole('button', {name: 'Delete'}))

        expect(deleteConstellation).toHaveBeenCalledWith('music', null)
        await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument())
        expect(screen.queryByRole('button', {name: /^Music/})).not.toBeInTheDocument()
    })

    it('offers a retry when the tree cannot be loaded', async () => {
        vi.mocked(listConstellations).mockRejectedValueOnce(new Error('down')).mockResolvedValue(TREE)
        render(<MemoryRouter><ConstellationsPage/></MemoryRouter>)

        await userEvent.click(await screen.findByRole('button', {name: 'Retry'}))

        expect(await screen.findByRole('button', {name: /^Music/})).toBeInTheDocument()
    })
})
