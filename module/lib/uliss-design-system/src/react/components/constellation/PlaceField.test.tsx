import {fireEvent, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {PlaceField} from './PlaceField'

function Field({onClear = true, disabled = false}: { onClear?: boolean; disabled?: boolean }) {
    const [place, setPlace] = useState<string | null>(null)
    return <>
        <PlaceField label="Place" placeholder="Choose a place" value={place} disabled={disabled}
                    onClear={onClear ? () => setPlace(null) : undefined}>
            {(close) => <div>
                <input aria-label="Search the tree" autoFocus/>
                <button type="button" onClick={() => {
                    setPlace('Music › Jazz')
                    close()
                }}>Pick Jazz</button>
            </div>}
        </PlaceField>
        <button type="button">Outside</button>
    </>
}

const field = (name: RegExp | string = /^Place/) => screen.getByRole('button', {name})

describe('PlaceField', () => {
    it('is one collapsed line that opens and closes the picker on click', async () => {
        render(<Field/>)

        expect(field()).toHaveTextContent('Choose a place')
        expect(field()).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('textbox', {name: 'Search the tree'})).not.toBeInTheDocument()

        await userEvent.click(field())
        expect(field()).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('textbox', {name: 'Search the tree'})).toHaveFocus()

        await userEvent.click(field())
        expect(screen.queryByRole('textbox', {name: 'Search the tree'})).not.toBeInTheDocument()
    })

    it('collapses on a pick, shows the chosen path and gives the focus back', async () => {
        render(<Field/>)

        await userEvent.click(field())
        await userEvent.click(screen.getByRole('button', {name: 'Pick Jazz'}))

        expect(screen.queryByRole('button', {name: 'Pick Jazz'})).not.toBeInTheDocument()
        expect(field('Place: Music › Jazz')).toHaveTextContent('Music › Jazz')
        expect(field('Place: Music › Jazz')).toHaveFocus()
    })

    it('collapses on Escape without letting the key reach the page, and gives the focus back', async () => {
        const onPageKey = vi.fn()
        document.addEventListener('keydown', onPageKey)
        render(<Field/>)

        await userEvent.click(field())
        fireEvent.keyDown(screen.getByRole('textbox', {name: 'Search the tree'}), {key: 'Escape'})

        expect(screen.queryByRole('textbox', {name: 'Search the tree'})).not.toBeInTheDocument()
        expect(field()).toHaveFocus()
        expect(onPageKey).not.toHaveBeenCalled()
        document.removeEventListener('keydown', onPageKey)
    })

    it('collapses on a click outside and leaves the focus where the click put it', async () => {
        render(<Field/>)

        await userEvent.click(field())
        await userEvent.click(screen.getByRole('button', {name: 'Outside'}))

        expect(screen.queryByRole('textbox', {name: 'Search the tree'})).not.toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Outside'})).toHaveFocus()
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
        expect(screen.queryByRole('textbox', {name: 'Search the tree'})).not.toBeInTheDocument()
    })
})
