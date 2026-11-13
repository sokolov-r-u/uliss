import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {OptionList} from './OptionCard'

describe('OptionList', () => {
    it('draws dot rows 48px high, or 66px when tall', () => {
        const {unmount} = render(<OptionList label="Choice" options={['One', 'Two']}/>)
        expect(screen.getAllByRole('radio').map((row) => row.style.minHeight)).toEqual(['48px', '48px'])
        unmount()

        render(<OptionList label="Choice" tall options={['One', {label: 'Two', note: 'With a note'}]}/>)
        expect(screen.getAllByRole('radio').map((row) => row.style.minHeight)).toEqual(['66px', '66px'])
    })
})
