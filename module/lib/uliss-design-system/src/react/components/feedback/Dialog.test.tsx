import {act, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {Dialog} from './Dialog'

const nextFrame = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))

describe('Dialog', () => {
    it('is a labelled modal that takes focus and keeps Tab inside', async () => {
        const user = userEvent.setup()
        render(<Dialog title="Delete note?" body="Chats stay." confirm="Delete" onConfirm={vi.fn()} onCancel={vi.fn()}/>)
        await nextFrame()

        expect(screen.getByRole('dialog', {name: 'Delete note?'})).toHaveAttribute('aria-modal', 'true')
        expect(screen.getByRole('button', {name: 'Not now'})).toHaveFocus()
        await user.tab()
        expect(screen.getByRole('button', {name: 'Delete'})).toHaveFocus()
        await user.tab()
        expect(screen.getByRole('button', {name: 'Not now'})).toHaveFocus()
    })

    it('cancels on Escape and on the backdrop', async () => {
        const user = userEvent.setup()
        const onCancel = vi.fn()
        const {container} = render(<Dialog title="Rename" onCancel={onCancel}/>)
        await nextFrame()

        await user.keyboard('{Escape}')
        expect(onCancel).toHaveBeenCalledTimes(1)
        await user.click(container.querySelector<HTMLButtonElement>('button[aria-hidden="true"]')!)
        expect(onCancel).toHaveBeenCalledTimes(2)
    })

    it('does not confirm while the confirm action is disabled', async () => {
        const user = userEvent.setup()
        const onConfirm = vi.fn()
        render(<Dialog title="Rename" confirm="Save" confirmDisabled onConfirm={onConfirm} onCancel={vi.fn()}/>)

        await user.click(screen.getByRole('button', {name: 'Save'}))
        expect(onConfirm).not.toHaveBeenCalled()
    })
})
