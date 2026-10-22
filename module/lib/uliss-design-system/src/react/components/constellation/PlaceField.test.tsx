import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {PlaceField} from './PlaceField'

/** A host that shows the picker as its own step (the line stays, as under a Notice step) and puts a place back. */
function Host({disabled = false}: { disabled?: boolean }) {
    const [place, setPlace] = useState<string | null>(null)
    const [picking, setPicking] = useState(false)
    return <>
        <PlaceField label="Place" placeholder="Choose a place" value={place} disabled={disabled}
                    open={picking} onOpen={() => setPicking(true)} onClear={() => setPlace(null)}/>
        {picking && <button type="button" onClick={() => {
            setPlace('Music › Jazz')
            setPicking(false)
        }}>Pick Jazz</button>}
    </>
}

const field = (name: RegExp | string = /^Place/) => screen.getByRole('button', {name})

describe('PlaceField', () => {
    it('is one line with the placeholder that asks the host to open the picker', async () => {
        const onOpen = vi.fn()
        render(<PlaceField label="Place" value={null} open={false} onOpen={onOpen}/>)

        expect(field('Place: Choose a place')).toHaveTextContent('Choose a place')
        expect(field()).toHaveAttribute('aria-expanded', 'false')
        await userEvent.click(field())

        expect(onOpen).toHaveBeenCalled()
    })

    it('shows the picked path and takes the focus back once the picker closes', async () => {
        render(<Host/>)

        await userEvent.click(field())
        await userEvent.click(screen.getByRole('button', {name: 'Pick Jazz'}))

        expect(field('Place: Music › Jazz')).toHaveTextContent('Music › Jazz')
        expect(field('Place: Music › Jazz')).toHaveFocus()
    })

    it('empties a chosen place with its clear button', async () => {
        render(<Host/>)
        expect(screen.queryByRole('button', {name: 'Clear the place'})).not.toBeInTheDocument()

        await userEvent.click(field())
        await userEvent.click(screen.getByRole('button', {name: 'Pick Jazz'}))
        await userEvent.click(screen.getByRole('button', {name: 'Clear the place'}))

        expect(field('Place: Choose a place')).toHaveFocus()
    })

    it('does not ask to open while disabled', async () => {
        const onOpen = vi.fn()
        render(<PlaceField label="Place" value="Music" open={false} onOpen={onOpen} onClear={vi.fn()} disabled/>)

        await userEvent.click(field())

        expect(field()).toBeDisabled()
        expect(screen.getByRole('button', {name: 'Clear the place'})).toBeDisabled()
        expect(onOpen).not.toHaveBeenCalled()
    })
})
