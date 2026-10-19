import {ConstellationColorEditor} from '@uliss/design-system'
import {fireEvent, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

describe('ConstellationColorEditor', () => {
    it('lets a root pick a palette tone, saving only a changed hue', async () => {
        const onSave = vi.fn()
        render(<ConstellationColorEditor mode="hue" name="Music" hue={264} onSave={onSave} onClose={vi.fn()}/>)

        expect(screen.getAllByRole('radio')).toHaveLength(13)
        expect(screen.getByRole('radio', {name: 'Hue 264'})).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled()

        await userEvent.click(screen.getByRole('radio', {name: 'Hue 22'}))
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))

        expect(onSave).toHaveBeenCalledWith(22)
    })

    it('takes any hue from the slider', async () => {
        const onSave = vi.fn()
        render(<ConstellationColorEditor mode="hue" name="Music" hue={264} onSave={onSave} onClose={vi.fn()}/>)

        fireEvent.change(screen.getByRole('slider', {name: 'Hue'}), {target: {value: '131'}})
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))

        expect(onSave).toHaveBeenCalledWith(131)
        expect(screen.getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true)
    })

    it('gives a sub-constellation four lightness steps and no hue of its own', async () => {
        const onSave = vi.fn()
        render(<ConstellationColorEditor mode="lightness" name="Jazz" hue={264} lightness="LIGHT" rootName="Music"
                                         onSave={onSave} onClose={vi.fn()}/>)

        expect(screen.queryByRole('slider')).not.toBeInTheDocument()
        expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Deep', 'Base', 'Light', 'Pale'])
        expect(screen.getByText(/Inherits from/)).toHaveTextContent('Inherits from Music')

        await userEvent.click(screen.getByRole('radio', {name: 'Pale'}))
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))

        expect(onSave).toHaveBeenCalledWith('PALE')
    })

    it('keeps Save disabled while busy', async () => {
        render(<ConstellationColorEditor mode="hue" name="Music" hue={264} busy onSave={vi.fn()} onClose={vi.fn()}/>)

        await userEvent.click(screen.getByRole('radio', {name: 'Hue 22'}))

        expect(screen.getByRole('button', {name: 'Saving…'})).toBeDisabled()
    })
})
