import {act, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useRef} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {useFocusTrap} from './useFocusTrap'

function Trap({onEscape, autoFocusLast = false}: { onEscape?: () => void; autoFocusLast?: boolean }) {
    const ref = useRef<HTMLDivElement>(null)
    useFocusTrap(ref, {onEscape})
    return <div ref={ref}>
        <button type="button">First</button>
        <button type="button" disabled>Disabled</button>
        <button type="button" autoFocus={autoFocusLast}>Last</button>
    </div>
}

const nextFrame = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))

describe('useFocusTrap', () => {
    it('focuses the first focusable element, or the autofocus one, on the next frame', async () => {
        const {unmount} = render(<Trap/>)
        await nextFrame()
        expect(screen.getByRole('button', {name: 'First'})).toHaveFocus()
        unmount()

        render(<Trap autoFocusLast/>)
        await nextFrame()
        expect(screen.getByRole('button', {name: 'Last'})).toHaveFocus()
    })

    it('wraps Tab from the last element to the first and Shift+Tab back, skipping disabled controls', async () => {
        const user = userEvent.setup()
        render(<Trap/>)
        await nextFrame()

        await user.tab()
        expect(screen.getByRole('button', {name: 'Last'})).toHaveFocus()
        await user.tab()
        expect(screen.getByRole('button', {name: 'First'})).toHaveFocus()
        await user.tab({shift: true})
        expect(screen.getByRole('button', {name: 'Last'})).toHaveFocus()
    })

    it('calls onEscape on Escape, but not when an inner control already handled it', async () => {
        const user = userEvent.setup()
        const onEscape = vi.fn()
        render(<Trap onEscape={onEscape}/>)
        await nextFrame()

        await user.keyboard('{Escape}')
        expect(onEscape).toHaveBeenCalledTimes(1)

        const first = screen.getByRole('button', {name: 'First'})
        first.addEventListener('keydown', (event) => event.preventDefault())
        await user.keyboard('{Escape}')
        expect(onEscape).toHaveBeenCalledTimes(1)
    })

    it('returns focus to the element that had it before the trap opened', async () => {
        const opener = document.createElement('button')
        document.body.append(opener)
        opener.focus()
        const {unmount} = render(<Trap/>)
        await nextFrame()
        expect(opener).not.toHaveFocus()

        unmount()
        expect(opener).toHaveFocus()
        opener.remove()
    })

    it('leaves out what is inert, such as a step drawn over', async () => {
        function InertTrap() {
            const ref = useRef<HTMLDivElement>(null)
            useFocusTrap(ref)
            return <div ref={ref}>
                <button type="button">First</button>
                <button type="button">Middle</button>
                <div inert><button type="button">Hidden</button></div>
            </div>
        }
        const user = userEvent.setup()
        render(<InertTrap/>)
        await nextFrame()

        await user.tab()
        await user.tab()

        expect(screen.getByRole('button', {name: 'First'})).toHaveFocus()
    })

    it('brings a Tab from outside the trap, such as a lost focus, back to the first element', async () => {
        render(<><button type="button">Behind</button><Trap/></>)
        await nextFrame()
        ;(document.activeElement as HTMLElement | null)?.blur()

        await userEvent.tab()

        expect(screen.getByRole('button', {name: 'First'})).toHaveFocus()
    })
})
