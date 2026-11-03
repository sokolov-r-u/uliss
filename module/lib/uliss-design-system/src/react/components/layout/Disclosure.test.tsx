import {fireEvent, render, screen} from '@testing-library/react'
import {useState} from 'react'
import {describe, expect, it} from 'vitest'
import {Disclosure} from './Disclosure'

function Section({initial = false}: { initial?: boolean }) {
    const [open, setOpen] = useState(initial)
    return (
        <Disclosure title="About me" hint="Designer" open={open} onToggle={setOpen}>
            <input aria-label="Draft"/>
        </Disclosure>
    )
}

describe('Disclosure', () => {
    it('opens and closes its body from the header and tells assistive tech which it is', () => {
        render(<Section/>)
        const header = screen.getByRole('button', {name: /About me/})
        expect(header).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('textbox', {name: 'Draft'})).not.toBeInTheDocument()

        fireEvent.click(header)
        expect(header).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('textbox', {name: 'Draft'})).toBeVisible()
        expect(document.getElementById(header.getAttribute('aria-controls')!)).not.toHaveAttribute('hidden')
    })

    it('keeps what was typed in its body while closed', () => {
        render(<Section initial/>)
        fireEvent.change(screen.getByRole('textbox', {name: 'Draft'}), {target: {value: 'half a thought'}})
        const header = screen.getByRole('button', {name: /About me/})

        fireEvent.click(header)
        fireEvent.click(header)

        expect(screen.getByRole('textbox', {name: 'Draft'})).toHaveValue('half a thought')
    })
})
