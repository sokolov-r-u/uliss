import {fireEvent, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useRef, useState} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {useFocusTrap} from '../../hooks/useFocusTrap'
import {PlaceField} from './PlaceField'

function Field({onClear = true, disabled = false}: { onClear?: boolean; disabled?: boolean }) {
    const [place, setPlace] = useState<string | null>(null)
    return <PlaceField label="Place" placeholder="Choose a place" value={place} disabled={disabled}
                       onClear={onClear ? () => setPlace(null) : undefined}>
        {(close) => <div>
            <input aria-label="Search the tree" autoFocus/>
            <button type="button" onClick={() => {
                setPlace('Music › Jazz')
                close()
            }}>Pick Jazz</button>
        </div>}
    </PlaceField>
}

/** A modal host like the web Notice overlay: it traps the focus and closes on Escape. */
function InDialog({onEscape}: { onEscape: () => void }) {
    const ref = useRef<HTMLDivElement>(null)
    useFocusTrap(ref, {onEscape})
    return <div ref={ref}><Field/></div>
}

const field = (name: RegExp | string = /^Place/) => screen.getByRole('button', {name})
const sheet = () => screen.queryByRole('dialog', {name: 'Place'})

describe('PlaceField', () => {
    it('is one collapsed line that opens the picker in a sheet of its own', async () => {
        const {container} = render(<Field/>)

        expect(field()).toHaveTextContent('Choose a place')
        expect(field()).toHaveAttribute('aria-expanded', 'false')
        expect(sheet()).not.toBeInTheDocument()

        await userEvent.click(field())

        expect(field()).toHaveAttribute('aria-expanded', 'true')
        expect(sheet()).toBeInTheDocument()
        // outside the field, so a host card never clips it
        expect(container.contains(sheet())).toBe(false)
        expect(screen.getByRole('textbox', {name: 'Search the tree'})).toHaveFocus()
    })

    it('collapses on a pick, shows the chosen path and gives the focus back', async () => {
        render(<Field/>)

        await userEvent.click(field())
        await userEvent.click(screen.getByRole('button', {name: 'Pick Jazz'}))

        expect(sheet()).not.toBeInTheDocument()
        expect(field('Place: Music › Jazz')).toHaveTextContent('Music › Jazz')
        expect(field('Place: Music › Jazz')).toHaveFocus()
    })

    it('collapses on Escape without letting the key reach the page, and gives the focus back', async () => {
        const onPageKey = vi.fn()
        document.addEventListener('keydown', onPageKey)
        render(<Field/>)

        await userEvent.click(field())
        fireEvent.keyDown(screen.getByRole('textbox', {name: 'Search the tree'}), {key: 'Escape'})

        expect(sheet()).not.toBeInTheDocument()
        expect(field()).toHaveFocus()
        expect(onPageKey).not.toHaveBeenCalled()
        document.removeEventListener('keydown', onPageKey)
    })

    it('inside a modal dialog closes only itself on Escape', async () => {
        const onEscape = vi.fn()
        render(<InDialog onEscape={onEscape}/>)

        await userEvent.click(field())
        await userEvent.keyboard('{Escape}')

        expect(sheet()).not.toBeInTheDocument()
        expect(onEscape).not.toHaveBeenCalled()
    })

    it('collapses on a click on its backdrop', async () => {
        render(<Field/>)

        await userEvent.click(field())
        await userEvent.click(screen.getByTestId('place-field-backdrop'))

        expect(sheet()).not.toBeInTheDocument()
        expect(field()).toHaveFocus()
    })

    it('empties a chosen place with its clear button', async () => {
        render(<Field/>)
        expect(screen.queryByRole('button', {name: 'Clear the place'})).not.toBeInTheDocument()

        await userEvent.click(field())
        await userEvent.click(screen.getByRole('button', {name: 'Pick Jazz'}))
        await userEvent.click(screen.getByRole('button', {name: 'Clear the place'}))

        expect(field('Place: Choose a place')).toHaveTextContent('Choose a place')
    })

    it('does not open while disabled', async () => {
        render(<Field disabled/>)

        await userEvent.click(field())

        expect(field()).toBeDisabled()
        expect(sheet()).not.toBeInTheDocument()
    })

    it('stays shut once disabled while open, even when enabled again', async () => {
        const {rerender} = render(<Field/>)
        await userEvent.click(field())

        rerender(<Field disabled/>)
        rerender(<Field/>)

        expect(sheet()).not.toBeInTheDocument()
    })
})
