import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {ConstellationPicker, type ConstellationPickerItem, type ConstellationPickerNoteItem} from './ConstellationPicker'

const ITEMS: ConstellationPickerItem[] = [
    {id: 'music', parentId: null, name: 'Music', depth: 0, path: [], color: 'red', count: 3},
    {id: 'jazz', parentId: 'music', name: 'Jazz', depth: 1, path: ['Music'], color: 'red', count: 2},
    {id: 'miles', parentId: 'jazz', name: 'Miles', depth: 2, path: ['Music', 'Jazz'], color: 'red'},
    {id: 'films', parentId: null, name: 'Films', depth: 0, path: [], color: 'blue'},
]

const NOTES: ConstellationPickerNoteItem[] = [
    {id: 'blue', title: 'Kind of Blue', parentId: null, constellationIds: ['jazz', 'films']},
    {id: 'so-what', title: 'So What', parentId: 'blue', constellationIds: []},
    {id: 'loose', title: 'Loose thought', parentId: null, constellationIds: []},
    {id: 'lost', title: 'Gone place', parentId: null, constellationIds: ['deleted']},
]

const add = (name: string) => `Add to ${name}`
const under = (title: string) => `Summarize under ${title}`

function rowNames() {
    return screen.queryAllByRole('listitem').map((row) => row.textContent)
}

function search() {
    return screen.getByRole('textbox', {name: 'Search the tree'})
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

    it('shows the lead row only while the search is empty', async () => {
        const onSelect = vi.fn()
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} lead={{label: 'Make it a root', onSelect}}/>)

        await userEvent.click(screen.getByRole('button', {name: 'Make it a root'}))
        expect(onSelect).toHaveBeenCalled()

        await userEvent.type(search(), 'm')
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

        await userEvent.type(search(), '  Glam   rock ')
        await userEvent.click(screen.getByRole('button', {name: 'Create “Glam rock”'}))
        expect(onCreate).toHaveBeenCalledWith('Glam rock', null)
        // the current match is no parent: a typed name taken at the root is not offered
        await userEvent.type(search(), 'films')
        expect(screen.getByRole('button', {name: 'Add to Films'})).toBeEnabled()
        expect(screen.queryByRole('button', {name: /^Create/})).not.toBeInTheDocument()
        await userEvent.clear(search())

        await userEvent.click(screen.getByRole('button', {name: '+ New constellation'}))
        await userEvent.type(screen.getByRole('textbox', {name: 'New constellation'}), 'Books{Enter}')
        expect(onCreate).toHaveBeenLastCalledWith('Books', null)
    })

    it('creates a typed name in the selection kept from before the search', async () => {
        const onCreate = vi.fn(async () => undefined)
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} onCreate={onCreate}/>)

        await userEvent.click(screen.getByRole('button', {name: /^Films/}))
        await userEvent.type(search(), 'Noir')
        await userEvent.click(screen.getByRole('button', {name: 'Create “Noir” in Films'}))

        expect(onCreate).toHaveBeenCalledWith('Noir', 'films')
    })

    it('goes back to the selection from before the search once nothing matches', async () => {
        const onCreate = vi.fn(async () => undefined)
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} onCreate={onCreate}/>)

        await userEvent.click(screen.getByRole('button', {name: /^Music/}))
        await userEvent.type(search(), 'Ja')
        expect(screen.getByRole('button', {name: 'Add to Jazz'})).toBeEnabled()
        await userEvent.type(search(), 'q')

        expect(screen.getByRole('button', {name: 'Add to Music'})).toBeEnabled()
        await userEvent.click(screen.getByRole('button', {name: 'Create “Jaq” in Music'}))
        expect(onCreate).toHaveBeenCalledWith('Jaq', 'music')
    })

    it('closes on Escape without letting the key reach the page', () => {
        const onClose = vi.fn()
        const onPageKey = vi.fn()
        document.addEventListener('keydown', onPageKey)
        render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} onClose={onClose}/>)

        fireEvent.keyDown(search(), {key: 'Escape'})

        expect(onClose).toHaveBeenCalled()
        expect(onPageKey).not.toHaveBeenCalled()
        document.removeEventListener('keydown', onPageKey)
    })

    describe('search in the tree', () => {
        it('keeps the tree, unfolds the branches to the matches, marks them and selects the first', async () => {
            render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()}/>)

            await userEvent.type(search(), 'jaz')

            expect(rowNames()).toEqual(['Music3', 'Jazz2', 'Films'])
            expect([...document.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['Jaz'])
            expect(screen.getByText('1 / 1')).toBeInTheDocument()
            expect(screen.getByRole('button', {name: /^Jazz/})).toHaveAttribute('aria-pressed', 'true')
            expect(screen.getByRole('button', {name: 'Add to Jazz'})).toBeEnabled()
        })

        it('cycles the matches with Enter, Shift+Enter and the arrows', async () => {
            render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()}/>)

            await userEvent.type(search(), 'i')
            expect(screen.getByText('1 / 3')).toBeInTheDocument()
            expect(screen.getByRole('button', {name: 'Add to Music'})).toBeEnabled()

            await userEvent.keyboard('{Enter}')
            expect(screen.getByText('2 / 3')).toBeInTheDocument()
            expect(screen.getByRole('button', {name: 'Add to Miles'})).toBeEnabled()
            expect(rowNames()).toEqual(['Music3', 'Jazz2', 'Miles', 'Films'])

            await userEvent.click(screen.getByRole('button', {name: 'Next match'}))
            expect(screen.getByRole('button', {name: 'Add to Films'})).toBeEnabled()
            await userEvent.type(search(), '{Enter}')
            expect(screen.getByText('1 / 3')).toBeInTheDocument()

            await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
            expect(screen.getByText('3 / 3')).toBeInTheDocument()
            await userEvent.click(screen.getByRole('button', {name: 'Previous match'}))
            await userEvent.keyboard('{ArrowUp}')
            expect(screen.getByText('1 / 3')).toBeInTheDocument()
            await userEvent.keyboard('{ArrowDown}')
            expect(screen.getByText('2 / 3')).toBeInTheDocument()
        })

        it('scrolls the current match into view', async () => {
            const scrolled: string[] = []
            const scrollIntoView = vi.fn(function (this: HTMLElement) {
                scrolled.push(this.textContent ?? '')
            })
            Element.prototype.scrollIntoView = scrollIntoView
            render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()}/>)

            try {
                await userEvent.type(search(), 'i{Enter}')

                expect(scrolled[scrolled.length - 1]).toBe('Miles')
            } finally {
                Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
            }
        })

        it('leaves the tree unfolded down to the selection once the search is cleared', async () => {
            render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()}/>)

            await userEvent.type(search(), 'i{Enter}')
            await userEvent.clear(search())

            expect(rowNames()).toEqual(['Music3', 'Jazz2', 'Miles', 'Films'])
            expect(screen.getByRole('button', {name: 'Add to Miles'})).toBeEnabled()
            expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument()
        })

        it('folds the branches it opened once cleared, unless the selection is inside', async () => {
            render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()}/>)

            await userEvent.type(search(), 'miles')
            await userEvent.click(screen.getByRole('button', {name: /^Films/}))
            await userEvent.clear(search())

            expect(rowNames()).toEqual(['Music3', 'Films'])
        })

        it('says so when nothing matches and keeps the selection', async () => {
            render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()}/>)
            await userEvent.click(screen.getByRole('button', {name: /^Films/}))

            await userEvent.type(search(), 'qqq')

            expect(screen.getByText('Nothing in the tree matches.')).toBeInTheDocument()
            expect(screen.getByText('0 / 0')).toBeInTheDocument()
            expect(screen.getByRole('button', {name: 'Next match'})).toBeDisabled()
            expect(screen.getByRole('button', {name: 'Add to Films'})).toBeEnabled()
        })
    })

    describe('with notes', () => {
        const notes = (onPick = vi.fn()) => ({items: NOTES, action: under, onPick})

        it('puts notes in each of their constellations, sub-notes under the parent, the rest last', async () => {
            render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} notes={notes()}/>)

            expect(rowNames()).toEqual(['Music3', 'Films', 'Without constellation'])
            expect(screen.getByRole('button', {name: 'Select a place'})).toBeDisabled()

            await userEvent.click(screen.getByRole('button', {name: 'Expand Films'}))
            await userEvent.click(screen.getByRole('button', {name: 'Expand Kind of Blue'}))
            await userEvent.click(screen.getByRole('button', {name: 'Expand Without constellation'}))
            expect(rowNames()).toEqual(['Music3', 'Films', 'Kind of Blue', 'So What', 'Without constellation',
                'Gone place', 'Loose thought'])

            await userEvent.click(screen.getByRole('button', {name: 'Expand Music'}))
            await userEvent.click(screen.getByRole('button', {name: 'Expand Jazz'}))
            expect(rowNames().slice(0, 4)).toEqual(['Music3', 'Jazz2', 'Miles', 'Kind of Blue'])
        })

        it('confirms a picked note with its own action', async () => {
            const onPick = vi.fn()
            const onPickNote = vi.fn()
            render(<ConstellationPicker items={ITEMS} action={add} onPick={onPick} notes={notes(onPickNote)}/>)

            await userEvent.click(screen.getByRole('button', {name: /^Films/}))
            await userEvent.click(screen.getByRole('button', {name: /^Kind of Blue/}))
            expect(rowNames()).toContain('So What')
            await userEvent.click(screen.getByRole('button', {name: 'Summarize under Kind of Blue'}))

            expect(onPickNote).toHaveBeenCalledWith('blue')
            expect(onPick).not.toHaveBeenCalled()
        })

        it('swaps a picked note for a picked constellation', async () => {
            render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} notes={notes()}/>)

            await userEvent.click(screen.getByRole('button', {name: /^Films/}))
            await userEvent.click(screen.getByRole('button', {name: /^Kind of Blue/}))
            await userEvent.click(screen.getByRole('button', {name: /^Films/}))

            expect(screen.getByRole('button', {name: 'Add to Films'})).toBeEnabled()
            expect(screen.getByRole('button', {name: /^Kind of Blue/})).toHaveAttribute('aria-pressed', 'false')
        })

        it('searches notes and constellations together, unfolding every place of a note', async () => {
            render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} notes={notes()}/>)

            await userEvent.type(search(), 'so')

            expect(screen.getByText('1 / 2')).toBeInTheDocument()
            expect(rowNames()).toEqual(['Music3', 'Jazz2', 'Miles', 'Kind of Blue', 'So What', 'Films',
                'Kind of Blue', 'So What', 'Without constellation'])
            expect(screen.getByRole('button', {name: 'Summarize under So What'})).toBeEnabled()
        })

        it('hides an excluded note with its sub-notes everywhere', async () => {
            render(<ConstellationPicker items={ITEMS} exclude={['blue']} action={add} onPick={vi.fn()}
                                        notes={notes()}/>)

            await userEvent.type(search(), 'o')

            expect(screen.queryByRole('button', {name: /^Kind of Blue/})).not.toBeInTheDocument()
            expect(screen.queryByRole('button', {name: /^So What/})).not.toBeInTheDocument()
            expect(screen.getAllByRole('button', {name: /^Loose thought/})).toHaveLength(1)
        })

        it('offers no new constellation inside a picked note', async () => {
            render(<ConstellationPicker items={ITEMS} action={add} onPick={vi.fn()} notes={notes()}
                                        onCreate={async () => undefined}/>)

            await userEvent.click(screen.getByRole('button', {name: /^Films/}))
            await userEvent.click(screen.getByRole('button', {name: /^Kind of Blue/}))

            expect(screen.queryByRole('button', {name: /^\+ New in/})).not.toBeInTheDocument()
            expect(screen.getByRole('button', {name: '+ New constellation'})).toBeInTheDocument()
        })

        it('shows the icon of a note before its name, keeps the slot for notes without one and searches names only', async () => {
            const items = [{...NOTES[2], icon: '🎷'}, NOTES[3]]
            const onPick = vi.fn()
            const {container} = render(<ConstellationPicker items={[]} action={add} onPick={vi.fn()}
                                                            notes={{items, action: under, onPick}}/>)

            expect(rowNames()).toEqual(['Gone place', '🎷 Loose thought'])
            const slots = container.querySelectorAll('[data-note-icon]')
            expect(slots).toHaveLength(2)
            expect(slots[0]).toBeEmptyDOMElement()

            await userEvent.type(search(), 'loose')
            expect(screen.getByRole('button', {name: '🎷 Loose thought'})).toHaveAttribute('aria-pressed', 'true')
            await userEvent.click(screen.getByRole('button', {name: 'Summarize under 🎷 Loose thought'}))
            expect(onPick).toHaveBeenCalledWith('loose')
        })

        it('lists notes as roots without constellations', async () => {
            render(<ConstellationPicker items={[]} action={add} onPick={vi.fn()}
                                        notes={{items: NOTES, action: (title) => `Move under ${title}`, onPick: vi.fn()}}/>)

            expect(rowNames()).toEqual(['Gone place', 'Kind of Blue', 'Loose thought'])
            expect(screen.getByRole('button', {name: 'Select a note'})).toBeDisabled()
        })
    })
})
