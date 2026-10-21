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

    it('renders a labelled menu of actions only and focuses the first item', () => {
        render(<ItemMenu anchor={anchorAt({})} label="Actions for Trip" actions={actions()} onClose={vi.fn()}/>)

        expect(screen.getByRole('menu', {name: 'Actions for Trip'})).toHaveTextContent(/^RenameDelete$/)
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

    it('jumps to the first and last item with Home and End', () => {
        render(<ItemMenu anchor={anchorAt({})} label="Actions" onClose={vi.fn()}
                         actions={[...actions(), {label: 'Open', onSelect: vi.fn()}]}/>)

        fireEvent.keyDown(document.activeElement!, {key: 'End'})
        expect(screen.getByRole('menuitem', {name: 'Open'})).toHaveFocus()
        fireEvent.keyDown(document.activeElement!, {key: 'Home'})
        expect(screen.getByRole('menuitem', {name: 'Rename'})).toHaveFocus()
    })

    it('closes on Tab, so focus never wanders behind the open menu', () => {
        const onClose = vi.fn()
        render(<ItemMenu anchor={anchorAt({})} label="Actions" actions={actions()} onClose={onClose}/>)

        expect(fireEvent.keyDown(document.activeElement!, {key: 'Tab'})).toBe(false)
        expect(onClose).toHaveBeenCalledOnce()
    })

    it('closes when the page scrolls or resizes under it', () => {
        const onClose = vi.fn()
        render(<ItemMenu anchor={anchorAt({})} label="Actions" actions={actions()} onClose={onClose}/>)

        fireEvent.scroll(document.body)
        fireEvent(window, new Event('resize'))
        expect(onClose).toHaveBeenCalledTimes(2)
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

describe('ListRow full title', () => {
    function overflowTitles(overflowing: boolean) {
        vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(overflowing ? 300 : 100)
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
    }

    it('shows the whole title in a panel after hovering a truncated row', () => {
        vi.useFakeTimers()
        overflowTitles(true)
        const title = 'A very long chat title that does not fit into the side panel row'
        render(<ListRow title={title} onClick={vi.fn()} onMenu={vi.fn()}/>)

        fireEvent.mouseEnter(screen.getByRole('button', {name: title}))
        act(() => vi.advanceTimersByTime(400))

        expect(screen.getByRole('tooltip')).toHaveTextContent(title)
        fireEvent.mouseLeave(screen.getByRole('button', {name: title}))
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    it('shows nothing extra when the title fits', () => {
        vi.useFakeTimers()
        overflowTitles(false)
        render(<ListRow title="Trip" onClick={vi.fn()} onMenu={vi.fn()}/>)

        fireEvent.mouseEnter(screen.getByRole('button', {name: 'Trip'}))
        act(() => vi.advanceTimersByTime(400))

        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    it('opens the full title above the row when there is no room below', () => {
        vi.useFakeTimers()
        overflowTitles(true)
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80)
        const title = 'A very long chat title near the bottom edge of the window'
        render(<ListRow title={title} onClick={vi.fn()} onMenu={vi.fn()}/>)
        const button = screen.getByRole('button', {name: title})
        const row = button.parentElement as HTMLElement
        row.getBoundingClientRect = () => ({
            top: window.innerHeight - 50, bottom: window.innerHeight - 6, left: 20, right: 300, width: 280, height: 44,
            x: 20, y: window.innerHeight - 50, toJSON: () => ({}),
        })

        fireEvent.mouseEnter(button)
        act(() => vi.advanceTimersByTime(400))

        expect(screen.getByRole('tooltip')).toHaveStyle({top: `${window.innerHeight - 50 - 4 - 80}px`})
    })
})

