import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {ChatComposer} from './ChatComposer'

describe('ChatComposer', () => {
    it('submits by clicking Send and pressing Enter', async () => {
        const onSubmit = vi.fn()
        const onChange = vi.fn()
        const page = render(<ChatComposer value="draft" onChange={onChange} onSubmit={onSubmit}/>)

        await userEvent.click(screen.getByRole('button', {name: 'Send'}))
        expect(onSubmit).toHaveBeenCalledOnce()

        page.rerender(<ChatComposer value="draft" onChange={onChange} onSubmit={onSubmit}/>)
        await userEvent.click(screen.getByRole('textbox', {name: 'Message'}))
        await userEvent.keyboard('{Enter}')
        expect(onSubmit).toHaveBeenCalledTimes(2)
    })

    it('replaces send with Stop during generation', async () => {
        const onStop = vi.fn()
        const onSubmit = vi.fn()
        render(<ChatComposer value="draft" onChange={() => undefined} onSubmit={onSubmit}
                             disabled generationActive onStop={onStop}/>)

        expect(screen.queryByRole('button', {name: 'Send'})).not.toBeInTheDocument()
        expect(screen.getByRole('textbox', {name: 'Message'})).toBeDisabled()
        await userEvent.click(screen.getByRole('button', {name: 'Stop generation'}))
        expect(onStop).toHaveBeenCalledOnce()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it('keeps send disabled while settling', () => {
        render(<ChatComposer value="draft" onChange={() => undefined} onSubmit={() => undefined} disabled/>)
        expect(screen.getByRole('button', {name: 'Send'})).toBeDisabled()
        expect(screen.queryByRole('button', {name: 'Stop generation'})).not.toBeInTheDocument()
    })
})
