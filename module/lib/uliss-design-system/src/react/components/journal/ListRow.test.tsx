import {render} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {Icon} from '../icons/Icon'
import {ListRow} from './ListRow'

const meta = (container: HTMLElement) => container.querySelector('[data-list-row-meta]')
const date = (container: HTMLElement) => container.querySelector('[data-list-row-date]')

describe('ListRow', () => {
    it('leaves the whole width to the title when there is no meta and no date', () => {
        const {container} = render(<ListRow title="Giant Steps" onClick={() => undefined} onMenu={() => undefined}/>)

        expect(meta(container)).toBeNull()
        expect(date(container)).toBeNull()
    })

    it('keeps the date column for a dated row without meta', () => {
        const {container} = render(<ListRow title="Giant Steps" date="Jun 22"/>)

        expect(meta(container)).toBeNull()
        expect(date(container)).toHaveTextContent('Jun 22')
    })

    it('shows meta and date when both are given', () => {
        const {container} = render(<ListRow title="Giant Steps" date="Jun 22"
                                            meta={<><Icon name="star" size={12}/>4</>}/>)

        expect(meta(container)).toHaveTextContent('4')
        expect(date(container)).toHaveTextContent('Jun 22')
    })
})
