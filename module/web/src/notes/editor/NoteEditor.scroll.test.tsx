import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {NoteEditor} from './NoteEditor'

describe('NoteEditor scroll positions', () => {
    it('keeps a separate scroll position for the text and the original, opening the original at the top', async () => {
        render(<div data-testid="scroller" style={{overflowY: 'auto'}}>
            <NoteEditor content="Saved text" onChange={vi.fn()}/>
        </div>)
        await screen.findByRole('textbox', {name: 'Note text'})
        const scroller = screen.getByTestId('scroller')
        const original = screen.getByRole('button', {name: 'Original'})

        scroller.scrollTop = 500
        await userEvent.click(original)
        expect(scroller.scrollTop).toBe(0)

        scroller.scrollTop = 900
        await userEvent.click(original)
        expect(scroller.scrollTop).toBe(500)

        scroller.scrollTop = 120
        await userEvent.click(original)
        expect(scroller.scrollTop).toBe(900)

        await userEvent.click(original)
        expect(scroller.scrollTop).toBe(120)
    })
})
