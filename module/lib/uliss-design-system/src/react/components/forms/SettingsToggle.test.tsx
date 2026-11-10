import {fireEvent, render, screen} from '@testing-library/react'
import {useState} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {SettingsToggle} from './SettingsToggle'

function Toggle({initial}: { initial: boolean }) {
    const [on, setOn] = useState(initial)
    return <SettingsToggle label="Posters in the sky" hint="Notes with a poster show it" on={on} onChange={setOn}/>
}

describe('SettingsToggle', () => {
    it('is a switch named by its label that flips its state on click', () => {
        render(<Toggle initial={true}/>)
        const toggle = screen.getByRole('switch', {name: /Posters in the sky/})
        expect(toggle).toHaveAttribute('aria-checked', 'true')

        fireEvent.click(toggle)
        expect(toggle).toHaveAttribute('aria-checked', 'false')
        fireEvent.click(toggle)
        expect(toggle).toHaveAttribute('aria-checked', 'true')
    })

    it('hands the new value to onChange and keeps the host\'s class', () => {
        const onChange = vi.fn()
        render(<SettingsToggle label="Glow" on={false} onChange={onChange} className="host-focus"/>)
        const toggle = screen.getByRole('switch', {name: 'Glow'})

        fireEvent.click(toggle)
        expect(onChange).toHaveBeenCalledWith(true)
        expect(toggle).toHaveClass('host-focus')
        expect(toggle).toHaveAttribute('type', 'button')
    })
})
