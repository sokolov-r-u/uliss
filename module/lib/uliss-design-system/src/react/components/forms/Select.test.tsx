import {act, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {Select} from './Select'

const OPTIONS = [{value: 'en', label: 'English'}, {value: 'de', label: 'Deutsch'}, {value: 'fr', label: 'Français'}]
const nextFrame = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))

function Language({onChange = vi.fn()}: { onChange?: (value: string) => void }) {
    const [value, setValue] = useState<string | null>('en')
    return <>
        <Select label="Language" value={value} options={OPTIONS} onChange={(next) => {
            setValue(next)
            onChange(next)
        }}/>
        <button type="button">Elsewhere</button>
    </>
}

describe('Select', () => {
    it('names the field and its current value on the trigger', () => {
        render(<Language/>)
        expect(screen.getByRole('button', {name: 'Language, English'})).toHaveAttribute('aria-expanded', 'false')
    })

    it('opens with ArrowDown, picks with the keyboard and returns focus to the trigger', async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<Language onChange={onChange}/>)

        screen.getByRole('button', {name: 'Language, English'}).focus()
        await user.keyboard('{ArrowDown}')
        await nextFrame()
        expect(screen.getByRole('listbox', {name: 'Language'})).toHaveFocus()

        await user.keyboard('{ArrowDown}{Enter}')
        await nextFrame()
        expect(onChange).toHaveBeenCalledWith('de')
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Language, Deutsch'})).toHaveFocus()
    })

    it('closes on Escape without picking', async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<Language onChange={onChange}/>)

        await user.click(screen.getByRole('button', {name: 'Language, English'}))
        await nextFrame()
        await user.keyboard('{End}{Escape}')
        await nextFrame()
        expect(onChange).not.toHaveBeenCalled()
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Language, English'})).toHaveFocus()
    })

    it('closes when focus leaves the open list', async () => {
        const user = userEvent.setup()
        render(<Language/>)

        await user.click(screen.getByRole('button', {name: 'Language, English'}))
        await nextFrame()
        await user.click(screen.getByRole('button', {name: 'Elsewhere'}))
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
})
