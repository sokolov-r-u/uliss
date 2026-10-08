import {ItemMenu, ListRow} from '@uliss/design-system'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

const anchors: HTMLElement[] = []

function anchorAt(rect: Partial<DOMRect>) {
    const anchor = document.createElement('button')
    anchor.textContent = 'dots'
    document.body.appendChild(anchor)
    anchors.push(anchor)
    anchor.getBoundingClientRect = () => ({
        top: 100, bottom: 120, left: 300, right: 344, width: 44, height: 20, x: 300, y: 100,
        toJSON: () => ({}), ...rect,
    })
    return anchor
}

afterEach(() => {
    anchors.splice(0).forEach((anchor) => anchor.remove())
    vi.useRealTimers()
})

describe('ItemMenu', () => {
    const actions = (rename = vi.fn(), remove = vi.fn(), deleteDisabled = false) => [
        {label: 'Rename', onSelect: rename},
        {label: 'Delete', onSelect: remove, danger: true, disabled: deleteDisabled},
    ]

    it('renders a labelled menu with the object title and focuses the first item', () => {
        render(<ItemMenu anchor={anchorAt({})} label="Actions for Trip" title="Trip" actions={actions()}
                         onClose={vi.fn()}/>)

        expect(screen.getByRole('menu', {name: 'Actions for Trip'})).toBeInTheDocument()
        expect(screen.getByText('Trip')).toBeInTheDocument()
        expect(screen.getByRole('menuitem', {name: 'Rename'})).toHaveFocus()
    })

    it('cycles focus with the arrow keys and skips disabled items', () => {
        render(<ItemMenu anchor={anchorAt({})} label="Actions" onClose={vi.fn()}
                         actions={[...actions(vi.fn(), vi.fn(), true), {label: 'Open', onSelect: vi.fn()}]}/>)

        fireEvent.keyDown(document, {key: 'ArrowDown'})
        expect(screen.getByRole('menuitem', {name: 'Open'})).toHaveFocus()
        fireEvent.keyDown(document, {key: 'ArrowDown'})
        expect(screen.getByRole('menuitem', {name: 'Rename'})).toHaveFocus()
        fireEvent.keyDown(document, {key: 'ArrowUp'})
        expect(screen.getByRole('menuitem', {name: 'Open'})).toHaveFocus()
    })

    it('keeps the focused item when the parent re-renders with a new onClose', () => {
        const anchor = anchorAt({})
        const items = actions()
        const {rerender} = render(<ItemMenu anchor={anchor} label="Actions" actions={items} onClose={() => {
        }}/>)
        fireEvent.keyDown(document, {key: 'ArrowDown'})

        rerender(<ItemMenu anchor={anchor} label="Actions" actions={items} onClose={() => {
        }}/>)

        expect(screen.getByRole('menuitem', {name: 'Delete'})).toHaveFocus()
    })

    it('runs the chosen action', () => {
        const remove = vi.fn()
        render(<ItemMenu anchor={anchorAt({})} label="Actions" actions={actions(vi.fn(), remove)} onClose={vi.fn()}/>)

        fireEvent.click(screen.getByRole('menuitem', {name: 'Delete'}))

        expect(remove).toHaveBeenCalledTimes(1)
    })

    it('closes on Escape and on a backdrop click', () => {
        const onClose = vi.fn()
        const {container} = render(<ItemMenu anchor={anchorAt({})} label="Actions" actions={actions()}
                                             onClose={onClose}/>)

        fireEvent.keyDown(document, {key: 'Escape'})
        fireEvent.click(document.querySelector('[aria-hidden="true"]') as HTMLElement)

        expect(onClose).toHaveBeenCalledTimes(2)
        expect(container).toBeEmptyDOMElement()
    })

    it('returns focus to the anchor when it closes', () => {
        const anchor = anchorAt({})
        const {unmount} = render(<ItemMenu anchor={anchor} label="Actions" actions={actions()} onClose={vi.fn()}/>)

        unmount()

        expect(anchor).toHaveFocus()
    })

    it('opens below the anchor and flips above it when the space below is short', () => {
        const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120)
        try {
            const {unmount} = render(<ItemMenu anchor={anchorAt({top: 100, bottom: 120})} label="Below"
                                               actions={actions()} onClose={vi.fn()}/>)
            expect(screen.getByRole('menu')).toHaveStyle({top: '124px'})
            unmount()

            const bottom = window.innerHeight - 10
            render(<ItemMenu anchor={anchorAt({top: bottom - 20, bottom})} label="Above"
                             actions={actions()} onClose={vi.fn()}/>)
            expect(screen.getByRole('menu')).toHaveStyle({top: `${bottom - 20 - 4 - 120}px`})
        } finally {
            height.mockRestore()
        }
    })
})

describe('ListRow menu', () => {
    it('passes the dots button as the menu anchor', () => {
        const onMenu = vi.fn()
        render(<ListRow title="Trip" onClick={vi.fn()} onMenu={onMenu}/>)

        const dots = screen.getByRole('button', {name: 'Actions for Trip'})
        fireEvent.click(dots)

        expect(onMenu).toHaveBeenCalledWith(dots)
    })

    it('opens the menu after a touch long-press and swallows the click that ends it', () => {
        vi.useFakeTimers()
        const onClick = vi.fn()
        const onMenu = vi.fn()
        render(<ListRow title="Trip" onClick={onClick} onMenu={onMenu}/>)
        const open = screen.getByRole('button', {name: 'Trip'})
        const row = open.parentElement as HTMLElement

        fireEvent.pointerDown(open, {pointerType: 'touch', clientX: 10, clientY: 10})
        act(() => vi.advanceTimersByTime(480))
        fireEvent.pointerUp(open, {pointerType: 'touch'})
        fireEvent.click(open)

        expect(onMenu).toHaveBeenCalledWith(row)
        expect(onClick).not.toHaveBeenCalled()
    })

    it('cancels the long-press when the finger moves more than 8px', () => {
        vi.useFakeTimers()
        const onMenu = vi.fn()
        render(<ListRow title="Trip" onClick={vi.fn()} onMenu={onMenu}/>)
        const open = screen.getByRole('button', {name: 'Trip'})

        fireEvent.pointerDown(open, {pointerType: 'touch', clientX: 10, clientY: 10})
        fireEvent.pointerMove(open, {pointerType: 'touch', clientX: 10, clientY: 20})
        act(() => vi.advanceTimersByTime(480))

        expect(onMenu).not.toHaveBeenCalled()
    })

    it('ignores a long mouse press and keeps the normal click', () => {
        vi.useFakeTimers()
        const onClick = vi.fn()
        const onMenu = vi.fn()
        render(<ListRow title="Trip" onClick={onClick} onMenu={onMenu}/>)
        const open = screen.getByRole('button', {name: 'Trip'})

        fireEvent.pointerDown(open, {pointerType: 'mouse', clientX: 10, clientY: 10})
        act(() => vi.advanceTimersByTime(480))
        fireEvent.click(open)

        expect(onMenu).not.toHaveBeenCalled()
        expect(onClick).toHaveBeenCalledTimes(1)
    })
})
