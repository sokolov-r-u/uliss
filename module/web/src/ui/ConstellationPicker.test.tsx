import {ConstellationPicker, type ConstellationPickerItem} from '@uliss/design-system'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

const ITEMS: ConstellationPickerItem[] = [
    {id: 'music', parentId: null, name: 'Music', depth: 0, path: [], color: 'red', count: 3},
    {id: 'jazz', parentId: 'music', name: 'Jazz', depth: 1, path: ['Music'], color: 'red', count: 2},
    {id: 'miles', parentId: 'jazz', name: 'Miles', depth: 2, path: ['Music', 'Jazz'], color: 'red'},
    {id: 'films', parentId: null, name: 'Films', depth: 0, path: [], color: 'blue'},
]

const add = (name: string) => `Add to ${name}`

function rowNames() {
    return screen.queryAllByRole('listitem').map((row) => row.textContent)
}

describe('ConstellationPicker', () => {
    it('opens on the roots, unfolds a branch on select and confirms it with the action', async () => {
        const onPick = vi.fn()
        render(<ConstellationPicker items={ITEMS} action={add} onPick={onPick}/>)

        expect(rowNames()).toEqual(['Music3', 'Films'])
        expect(screen.getByRole('button', {name: 'Select a constellation'})).toBeDisabled()

        await userEvent.click(screen.getByRole('button', {name: /^Music/}))
        expect(rowNames()).toEqual(['Music3', 'Jazz2', 'Films'])
        await userEvent.click(screen.getByRole('button', {name: /^Jazz/}))
        expect(rowNames()).toEqual(['Music3', 'Jazz2', 'Miles', 'Films'])
        expect(screen.getByRole('button', {name: /^Jazz/})).toHaveAttribute('aria-pressed', 'true')

        await userEvent.click(screen.getByRole('button', {name: 'Add to Jazz'}))
        expect(onPick).toHaveBeenCalledWith('jazz')
    })

    it('folds a branch with its chevron without selecting it', async () => {
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()}/>)

        await userEvent.click(screen.getByRole('button', {name: 'Expand Music'}))
        expect(rowNames()).toEqual(['Music3', 'Jazz2', 'Films'])
        await userEvent.click(screen.getByRole('button', {name: 'Collapse Music'}))

        expect(rowNames()).toEqual(['Music3', 'Films'])
        expect(screen.getByRole('button', {name: 'Select a constellation'})).toBeDisabled()
    })

    it('hides excluded branches with their subtrees', async () => {
        render(<ConstellationPicker items={ITEMS} exclude={['jazz']} action={add} onPick={vi.fn()}/>)

        await userEvent.click(screen.getByRole('button', {name: /^Music/}))

        expect(rowNames()).toEqual(['Music3', 'Films'])
    })

    it('matches the search against the name and every ancestor name, and keeps a hit selected after it', async () => {
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()}/>)
        const search = screen.getByRole('textbox', {name: 'Search the tree'})

        await userEvent.type(search, 'jaz')
        expect(rowNames()).toEqual(['JazzMusic2', 'MilesMusic › Jazz'])
        await userEvent.click(screen.getByRole('button', {name: /^Miles/}))
        await userEvent.clear(search)

        expect(rowNames()).toEqual(['Music3', 'Jazz2', 'Miles', 'Films'])
        expect(screen.getByRole('button', {name: 'Add to Miles'})).toBeEnabled()
    })

    it('shows the lead row only while the search is empty', async () => {
        const onSelect = vi.fn()
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} lead={{label: 'Make it a root', onSelect}}/>)

        await userEvent.click(screen.getByRole('button', {name: 'Make it a root'}))
        expect(onSelect).toHaveBeenCalled()

        await userEvent.type(screen.getByRole('textbox'), 'm')
        expect(screen.queryByRole('button', {name: 'Make it a root'})).not.toBeInTheDocument()
    })

    it('creates a sub-constellation in the selection and selects it', async () => {
        const onCreate = vi.fn(async () => 'bebop')
        const {rerender} = render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} onCreate={onCreate}/>)

        await userEvent.click(screen.getByRole('button', {name: /^Music/}))
        await userEvent.click(screen.getByRole('button', {name: '+ New in Music'}))
        await userEvent.type(screen.getByRole('textbox', {name: 'New constellation in Music'}), '  Be   bop {Enter}')

        expect(onCreate).toHaveBeenCalledWith('Be bop', 'music')
        rerender(<ConstellationPicker items={[...ITEMS, {id: 'bebop', parentId: 'music', name: 'Be bop', depth: 1,
            path: ['Music'], color: 'red'}]} action={add} onPick={vi.fn()} onCreate={onCreate}/>)
        await waitFor(() => expect(screen.getByRole('button', {name: 'Add to Be bop'})).toBeEnabled())
    })

    it('creates a root, and offers a typed name only when no sibling has it', async () => {
        const onCreate = vi.fn(async () => undefined)
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} onCreate={onCreate}/>)
        const search = screen.getByRole('textbox', {name: 'Search the tree'})

        await userEvent.type(search, 'music')
        expect(screen.queryByRole('button', {name: /^Create/})).not.toBeInTheDocument()
        await userEvent.clear(search)
        await userEvent.type(search, '  Glam   rock ')
        await userEvent.click(screen.getByRole('button', {name: 'Create “Glam rock”'}))
        expect(onCreate).toHaveBeenCalledWith('Glam rock', null)

        await userEvent.click(screen.getByRole('button', {name: '+ New constellation'}))
        await userEvent.type(screen.getByRole('textbox', {name: 'New constellation'}), 'Books{Enter}')
        expect(onCreate).toHaveBeenLastCalledWith('Books', null)
    })

    it('says so when nothing matches', async () => {
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()}/>)

        await userEvent.type(screen.getByRole('textbox'), 'zzz')

        expect(screen.getByText('Nothing in the tree matches.')).toBeInTheDocument()
    })

    it('closes on Escape without letting the key reach the page', () => {
        const onClose = vi.fn()
        const onPageKey = vi.fn()
        document.addEventListener('keydown', onPageKey)
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} onClose={onClose}/>)

        fireEvent.keyDown(screen.getByRole('textbox'), {key: 'Escape'})

        expect(onClose).toHaveBeenCalled()
        expect(onPageKey).not.toHaveBeenCalled()
        document.removeEventListener('keydown', onPageKey)
    })

    it('searches notes with the typed text and confirms a picked note with its own action', async () => {
        const search = vi.fn(async (query: string) => query.toLowerCase().startsWith('lo')
            ? [{id: 'low', title: 'Low', path: ['Music', 'Bowie'], color: 'red'}]
            : [])
        const onPick = vi.fn()
        const onPickNote = vi.fn()
        render(<ConstellationPicker items={ITEMS} action={add} onPick={onPick}
                                    notes={{search, action: (title) => `Summarize under ${title}`, onPick: onPickNote}}/>)

        expect(screen.getByRole('button', {name: 'Select a place'})).toBeDisabled()
        await userEvent.type(screen.getByRole('textbox'), 'lo')

        expect(await screen.findByRole('button', {name: /^Low/})).toHaveTextContent('Music › Bowie')
        // The search waits for the typing to pause: one call for the final text only.
        expect(search).toHaveBeenCalledTimes(1)
        expect(search).toHaveBeenCalledWith('lo', expect.any(AbortSignal))
        await userEvent.click(screen.getByRole('button', {name: /^Low/}))
        await userEvent.click(screen.getByRole('button', {name: 'Summarize under Low'}))

        expect(onPickNote).toHaveBeenCalledWith('low')
        expect(onPick).not.toHaveBeenCalled()
    })

    it('swaps a picked note for a picked constellation', async () => {
        const search = vi.fn(async () => [{id: 'jazz-note', title: 'Jazz night', path: []}])
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()}
                                    notes={{search, action: (title) => `Under ${title}`, onPick: vi.fn()}}/>)

        await userEvent.type(screen.getByRole('textbox'), 'jazz')
        await userEvent.click(await screen.findByRole('button', {name: /^Jazz night/}))
        expect(screen.getByRole('button', {name: 'Under Jazz night'})).toBeEnabled()

        await userEvent.click(screen.getByRole('button', {name: /^Jazz(?! night)/}))
        expect(screen.getByRole('button', {name: 'Add to Jazz'})).toBeEnabled()
        expect(screen.getByRole('button', {name: /^Jazz night/})).toHaveAttribute('aria-pressed', 'false')
    })

    it('is a note finder without constellations and reports a failed search', async () => {
        const search = vi.fn(async () => {
            throw new Error('down')
        })
        render(<ConstellationPicker items={[]} action={add} onPick={vi.fn()}
                                    notes={{search, action: (title) => `Move under ${title}`, onPick: vi.fn()}}/>)

        expect(screen.getByText('Type to find a note.')).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Select a note'})).toBeDisabled()
        await userEvent.type(screen.getByRole('textbox'), 'x')
        expect(await screen.findByText('Could not search the notes')).toBeInTheDocument()
    })

    it('says nothing matches when neither constellations nor notes do', async () => {
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()}
                                    notes={{search: async () => [], action: (title) => title, onPick: vi.fn()}}/>)

        await userEvent.type(screen.getByRole('textbox'), 'zzz')
        expect(await screen.findByText('Nothing matches.')).toBeInTheDocument()
    })
})
