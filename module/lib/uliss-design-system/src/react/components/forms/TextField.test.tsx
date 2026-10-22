import {fireEvent, render, screen} from '@testing-library/react'
import {useState} from 'react'
import {describe, expect, it} from 'vitest'
import {TextField} from './TextField'

function Field({initial = '', limit, maxLength}: { initial?: string; limit?: number; maxLength?: number }) {
    const [value, setValue] = useState(initial)
    return <TextField label="Name" value={value} onChange={(event) => setValue(event.target.value)}
                      limit={limit} maxLength={maxLength}/>
}

describe('TextField', () => {
    it('keeps the hard maxLength by default: the input is capped and the counter is padded', () => {
        render(<Field initial="Penny" maxLength={24}/>)

        expect(screen.getByRole('textbox', {name: 'Name'})).toHaveAttribute('maxlength', '24')
        expect(screen.getByText('05 / 24')).toBeInTheDocument()
    })

    it('with a soft limit takes any length and marks the value invalid only past the limit', () => {
        render(<Field limit={5}/>)
        const input = screen.getByRole('textbox', {name: 'Name'})
        expect(input).not.toHaveAttribute('maxlength')

        fireEvent.change(input, {target: {value: 'Coltrane'}})
        expect(input).toHaveValue('Coltrane')
        expect(screen.getByText('8/5')).toBeInTheDocument()
        expect(input).toHaveAttribute('aria-invalid', 'true')

        fireEvent.change(input, {target: {value: 'Bird'}})
        expect(screen.getByText('4/5')).toBeInTheDocument()
        expect(input).not.toHaveAttribute('aria-invalid')
    })

    it('counts code points of the trimmed value with whitespace runs as one, like the title rule', () => {
        render(<Field initial={'  🎷🎷   🎺 '} limit={4}/>)

        expect(screen.getByText('4/4')).toBeInTheDocument()
        expect(screen.getByRole('textbox', {name: 'Name'})).not.toHaveAttribute('aria-invalid')
    })

    it('puts the trailing control inside the field, after the input in tab order', () => {
        render(<TextField label="Name" value="" onChange={() => undefined}
                          trailing={<button type="button">Dictate</button>}/>)

        const input = screen.getByRole('textbox', {name: 'Name'})
        const button = screen.getByRole('button', {name: 'Dictate'})
        expect(input.parentElement).toContainElement(button)
        expect(input.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
})
