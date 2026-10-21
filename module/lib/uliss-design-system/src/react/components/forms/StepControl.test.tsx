import {act, fireEvent, render, screen} from '@testing-library/react'
import {useState} from 'react'
import {describe, expect, it} from 'vitest'
import {OptionList} from './OptionCard'
import {StepControl} from './StepControl'

const nextFrame = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))
const tabStops = () => screen.getAllByRole('radio').filter((radio) => radio.tabIndex === 0)

const STEPS = [{id: 's', label: 'Small'}, {id: 'm', label: 'Medium'}, {id: 'l', label: 'Large'}]

function Steps({initial}: { initial?: string }) {
    const [value, setValue] = useState(initial)
    return <StepControl label="Size" steps={STEPS} value={value} onPick={setValue}/>
}

describe('StepControl', () => {
    it('has one tab stop: the checked step, or the first while nothing is checked', () => {
        const {unmount} = render(<Steps initial="m"/>)
        expect(tabStops()).toEqual([screen.getByRole('radio', {name: 'Medium'})])
        unmount()

        render(<Steps/>)
        expect(tabStops()).toEqual([screen.getByRole('radio', {name: 'Small'})])
    })

    it('checks and focuses the next step with the arrows, wrapping at the ends', async () => {
        render(<Steps initial="l"/>)
        const large = screen.getByRole('radio', {name: 'Large'})
        large.focus()

        fireEvent.keyDown(large, {key: 'ArrowRight'})
        await nextFrame()
        const small = screen.getByRole('radio', {name: 'Small'})
        expect(small).toHaveAttribute('aria-checked', 'true')
        expect(small).toHaveFocus()

        fireEvent.keyDown(small, {key: 'ArrowUp'})
        await nextFrame()
        expect(screen.getByRole('radio', {name: 'Large'})).toHaveFocus()
    })
})

function Options({initial, disabledRows}: { initial: number; disabledRows: number[] }) {
    const [selected, setSelected] = useState(initial)
    const options = ['Daily', 'Weekly', 'Monthly', 'Never'].map((label, i) => ({label, disabled: disabledRows.includes(i)}))
    return <OptionList label="Digest" options={options} selected={selected} onPick={setSelected}/>
}

describe('OptionList', () => {
    it('hands the tab stop to the first enabled row when the selected one is disabled', () => {
        render(<Options initial={0} disabledRows={[0]}/>)
        expect(tabStops()).toEqual([screen.getByRole('radio', {name: /Weekly/})])
    })

    it('skips disabled rows with the arrows', async () => {
        render(<Options initial={1} disabledRows={[2]}/>)
        const weekly = screen.getByRole('radio', {name: /Weekly/})
        weekly.focus()

        fireEvent.keyDown(weekly, {key: 'ArrowDown'})
        await nextFrame()
        expect(screen.getByRole('radio', {name: /Never/})).toHaveFocus()
        expect(tabStops()).toEqual([screen.getByRole('radio', {name: /Never/})])
    })
})
