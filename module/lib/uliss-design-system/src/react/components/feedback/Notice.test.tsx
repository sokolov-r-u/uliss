import {render, screen} from '@testing-library/react'
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
})
