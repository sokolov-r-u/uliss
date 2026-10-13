import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ContextPanel, PanelSection} from './ContextPanel'

describe('ContextPanel', () => {
    beforeEach(() => localStorage.clear())

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

    it('widens from its left edge handle and remembers the width', async () => {
        render(<ContextPanel label="This note" open onClose={() => undefined}><p>Body</p></ContextPanel>)
        const handle = screen.getByRole('separator', {name: 'Resize panel'})
        expect(handle).toHaveAttribute('aria-valuenow', '300')

        handle.focus()
        await userEvent.keyboard('{ArrowLeft}')

        expect(handle).toHaveAttribute('aria-valuenow', '316')
        expect(localStorage.getItem('uliss.context-panel.width')).toBe('316')
    })

    it('leaves the wide rail open on Escape pressed outside it', async () => {
        const onClose = vi.fn()
        render(<><input aria-label="Composer"/>
            <ContextPanel label="This chat" open onClose={onClose}><p>Body</p></ContextPanel></>)
        // From 768px the scrim is hidden by CSS: the panel is a rail, not a drawer.
        const backdrop = document.querySelector<HTMLElement>('.context-backdrop')
        if (backdrop) backdrop.style.display = 'none'

        screen.getByRole('textbox', {name: 'Composer'}).focus()
        await userEvent.keyboard('{Escape}')
        expect(onClose).not.toHaveBeenCalled()

        screen.getByRole('button', {name: 'Close panel'}).focus()
        await userEvent.keyboard('{Escape}')
        expect(onClose).toHaveBeenCalledOnce()
    })
})

