import {fireEvent, render, screen} from '@testing-library/react'
import {useRef, useState} from 'react'
import {describe, expect, it} from 'vitest'
import {arrowFocus} from './arrowFocus'

function Grid({count, columns}: { count: number; columns: number }) {
    const [index, setIndex] = useState(0)
    const group = useRef<HTMLDivElement>(null)
    return <div ref={group}>
        {Array.from({length: count}, (_, i) => <button key={i} type="button" tabIndex={i === index ? 0 : -1}
                                                       onKeyDown={(event) => {
                                                           const next = arrowFocus(event, group.current, i, count, columns)
                                                           if (next !== null) setIndex(next)
                                                       }}>{`Item ${i}`}</button>)}
    </div>
}

const press = async (key: string) => {
    fireEvent.keyDown(document.activeElement!, {key})
    await new Promise((resolve) => requestAnimationFrame(resolve))
}
const focused = () => document.activeElement?.textContent

describe('arrowFocus', () => {
    it('moves along a row, wraps at the ends, and jumps a row with Up/Down in a grid', async () => {
        render(<Grid count={6} columns={3}/>)
        screen.getByRole('button', {name: 'Item 0'}).focus()

        await press('ArrowLeft')
        expect(focused()).toBe('Item 5')
        await press('ArrowRight')
        expect(focused()).toBe('Item 0')
        await press('ArrowDown')
        expect(focused()).toBe('Item 3')
        await press('ArrowUp')
        expect(focused()).toBe('Item 0')
    })

    it('goes to the ends with Home and End and leaves other keys alone', async () => {
        render(<Grid count={4} columns={4}/>)
        screen.getByRole('button', {name: 'Item 0'}).focus()

        await press('End')
        expect(focused()).toBe('Item 3')
        await press('Home')
        expect(focused()).toBe('Item 0')
        await press('a')
        expect(focused()).toBe('Item 0')
        expect(screen.getByRole('button', {name: 'Item 0'})).toHaveAttribute('tabindex', '0')
    })
})
