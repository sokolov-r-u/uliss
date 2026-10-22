import {fireEvent, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {Notice} from './Notice'

describe('Notice', () => {
    it('a blocking notice offers no close and no secondary action, only the skip it was given', async () => {
        const user = userEvent.setup()
        const onSkip = vi.fn()
        render(<Notice blocking title="Your name" secondary="Later" onSecondary={vi.fn()} showClose onClose={vi.fn()}
                       skip="Not now" onSkip={onSkip}/>)

        expect(screen.queryByRole('button', {name: 'Close'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Later'})).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', {name: 'Not now'}))
        expect(onSkip).toHaveBeenCalled()
    })

    it('a regular notice shows close and secondary when it has handlers for them', () => {
        render(<Notice title="Saved" secondary="Undo" onSecondary={vi.fn()} showClose onClose={vi.fn()}/>)

        expect(screen.getByRole('dialog', {name: 'Saved'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Close'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Undo'})).toBeInTheDocument()
    })

    it('does not run the primary action while it is disabled', async () => {
        const user = userEvent.setup()
        const onPrimary = vi.fn()
        render(<Notice title="Name" primary="Save" primaryDisabled onPrimary={onPrimary}/>)

        await user.click(screen.getByRole('button', {name: 'Save'}))
        expect(onPrimary).not.toHaveBeenCalled()
    })

    it('keeps a disabled secondary action in place without running it', async () => {
        const user = userEvent.setup()
        const onSecondary = vi.fn()
        render(<Notice title="Name" primary="" secondary="Skip for now" secondaryDisabled onSecondary={onSecondary}/>)

        const skip = screen.getByRole('button', {name: 'Skip for now'})
        expect(skip).toBeDisabled()
        await user.click(skip)
        expect(onSecondary).not.toHaveBeenCalled()
    })

    describe('with a second step', () => {
        const renderStep = (onBack = vi.fn(), onClose = vi.fn()) => render(
            <Notice title="Create a note?" primary="Summarize" showClose onClose={onClose}
                    step={{title: 'Choose a place', onBack, children: <input aria-label="Find a place"/>}}>
                <input aria-label="Name"/>
            </Notice>)

        it('draws the step in the same card and keeps the first step only for the size, out of reach', () => {
            renderStep()

            expect(screen.getByRole('dialog', {name: 'Choose a place'})).toBeInTheDocument()
            expect(screen.getByRole('textbox', {name: 'Find a place'})).toBeInTheDocument()
            expect(screen.queryByRole('textbox', {name: 'Name'})).not.toBeInTheDocument()
            expect(screen.queryByRole('button', {name: 'Summarize'})).not.toBeInTheDocument()
            expect(screen.getByText('Create a note?').closest('[inert]')).not.toBeNull()
        })

        it('goes back from its corner button instead of closing', async () => {
            const onBack = vi.fn()
            const onClose = vi.fn()
            renderStep(onBack, onClose)

            expect(screen.queryByRole('button', {name: 'Close'})).not.toBeInTheDocument()
            await userEvent.click(screen.getByRole('button', {name: 'Back'}))

            expect(onBack).toHaveBeenCalled()
            expect(onClose).not.toHaveBeenCalled()
        })

        it('goes back on Escape without letting the key reach the page', () => {
            const onBack = vi.fn()
            const onPageKey = vi.fn()
            document.addEventListener('keydown', onPageKey)
            renderStep(onBack)

            fireEvent.keyDown(screen.getByRole('textbox', {name: 'Find a place'}), {key: 'Escape'})

            expect(onBack).toHaveBeenCalled()
            expect(onPageKey).not.toHaveBeenCalled()
            document.removeEventListener('keydown', onPageKey)
        })
    })
})
