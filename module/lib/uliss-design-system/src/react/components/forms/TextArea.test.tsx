import {fireEvent, render, screen} from '@testing-library/react'
import {useState} from 'react'
import {describe, expect, it} from 'vitest'
import {TextArea} from './TextArea'

function Area({initial = '', limit}: { initial?: string; limit?: number }) {
    const [value, setValue] = useState(initial)
    return <TextArea label="About me" value={value} onChange={(event) => setValue(event.target.value)} limit={limit}/>
}

describe('TextArea', () => {
    it('takes text past its soft limit and marks it invalid only there', () => {
        render(<Area limit={5}/>)
        const area = screen.getByRole('textbox', {name: 'About me'})
        expect(area).not.toHaveAttribute('maxlength')

        fireEvent.change(area, {target: {value: 'Coltrane'}})
        expect(area).toHaveValue('Coltrane')
        expect(screen.getByText('8/5')).toBeInTheDocument()
        expect(area).toHaveAttribute('aria-invalid', 'true')

        fireEvent.change(area, {target: {value: 'Bird'}})
        expect(screen.getByText('4/5')).toBeInTheDocument()
        expect(area).not.toHaveAttribute('aria-invalid')
    })

    it('counts the trimmed text, line breaks inside included', () => {
        render(<Area initial={'  a\nb  '} limit={3}/>)

        expect(screen.getByText('3/3')).toBeInTheDocument()
        expect(screen.getByRole('textbox', {name: 'About me'})).not.toHaveAttribute('aria-invalid')
    })

    it('shows no counter while empty or without a limit', () => {
        const {unmount} = render(<Area limit={5}/>)
        expect(screen.queryByText('0/5')).not.toBeInTheDocument()
        unmount()

        render(<Area initial="Bird"/>)
        expect(screen.queryByText(/\/\d/)).not.toBeInTheDocument()
    })
})
