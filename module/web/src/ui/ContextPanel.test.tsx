import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {ContextPanel, PanelSection} from './ContextPanel'

describe('ContextPanel', () => {
    it('renders its sections under a labelled panel and closes from the close button', async () => {
        const onClose = vi.fn()
        render(<ContextPanel label="This note" open onClose={onClose}>
            <PanelSection label="Dates"><p>Written Jun 22</p></PanelSection>
        </ContextPanel>)

        expect(screen.getByRole('complementary', {name: 'This note'})).toHaveTextContent('Written Jun 22')
        await userEvent.click(screen.getByRole('button', {name: 'Close panel'}))
        expect(onClose).toHaveBeenCalledOnce()
    })

    it('closes on Escape and renders nothing while closed', async () => {
        const onClose = vi.fn()
        const view = render(<ContextPanel label="This chat" open onClose={onClose}><p>Body</p></ContextPanel>)

        await userEvent.keyboard('{Escape}')
        expect(onClose).toHaveBeenCalledOnce()

        view.rerender(<ContextPanel label="This chat" open={false} onClose={onClose}><p>Body</p></ContextPanel>)
        expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    })
})
