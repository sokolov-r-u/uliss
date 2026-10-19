import {ConstellationPicker, type ConstellationPickerItem} from '@uliss/design-system'
import {fireEvent, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

const ITEMS: ConstellationPickerItem[] = [
    {id: 'music', name: 'Music', depth: 0, path: [], color: 'red', count: 3},
    {id: 'jazz', name: 'Jazz', depth: 1, path: ['Music'], color: 'red', count: 2},
    {id: 'miles', name: 'Miles', depth: 2, path: ['Music', 'Jazz'], color: 'red'},
    {id: 'films', name: 'Films', depth: 0, path: [], color: 'blue'},
]

function rowNames() {
    return screen.queryAllByRole('listitem').map((row) => row.textContent)
}

describe('ConstellationPicker', () => {
    it('lists the tree without the excluded nodes and picks a node', async () => {
        const onPick = vi.fn()
        render(<ConstellationPicker items={ITEMS} exclude={['jazz', 'miles']} onPick={onPick}/>)

        expect(rowNames()).toEqual(['Music3', 'Films'])
        await userEvent.click(screen.getByRole('button', {name: /^Films/}))

        expect(onPick).toHaveBeenCalledWith('films')
    })

    it('matches the search against the name and every ancestor name', async () => {
        render(<ConstellationPicker items={ITEMS} onPick={vi.fn()}/>)

        await userEvent.type(screen.getByRole('textbox', {name: 'Search the tree'}), 'jaz')

        expect(rowNames()).toEqual(['JazzMusic2', 'MilesMusic › Jazz'])
    })

    it('shows the lead row only while the search is empty', async () => {
        const onSelect = vi.fn()
        render(<ConstellationPicker items={ITEMS} onPick={vi.fn()} lead={{label: 'Make it a root', onSelect}}/>)

        await userEvent.click(screen.getByRole('button', {name: 'Make it a root'}))
        expect(onSelect).toHaveBeenCalled()

        await userEvent.type(screen.getByRole('textbox'), 'm')
        expect(screen.queryByRole('button', {name: 'Make it a root'})).not.toBeInTheDocument()
    })

    it('offers to create a typed name only when no node has exactly that name', async () => {
        const onCreate = vi.fn()
        render(<ConstellationPicker items={ITEMS} onPick={vi.fn()} onCreate={onCreate}/>)
        const search = screen.getByRole('textbox')

        await userEvent.type(search, 'music')
        expect(screen.queryByRole('button', {name: /^Create/})).not.toBeInTheDocument()

        await userEvent.clear(search)
        await userEvent.type(search, '  Glam   rock ')
        await userEvent.click(screen.getByRole('button', {name: 'Create “Glam rock”'}))
        expect(onCreate).toHaveBeenCalledWith('Glam rock')
    })

    it('says so when nothing matches', async () => {
        render(<ConstellationPicker items={ITEMS} onPick={vi.fn()}/>)

        await userEvent.type(screen.getByRole('textbox'), 'zzz')

        expect(screen.getByText('Nothing in the tree matches.')).toBeInTheDocument()
    })

    it('closes on Escape without letting the key reach the page', () => {
        const onClose = vi.fn()
        const onPageKey = vi.fn()
        document.addEventListener('keydown', onPageKey)
        render(<ConstellationPicker items={ITEMS} onPick={vi.fn()} onClose={onClose}/>)

        fireEvent.keyDown(screen.getByRole('textbox'), {key: 'Escape'})

        expect(onClose).toHaveBeenCalled()
        expect(onPageKey).not.toHaveBeenCalled()
        document.removeEventListener('keydown', onPageKey)
    })
})
