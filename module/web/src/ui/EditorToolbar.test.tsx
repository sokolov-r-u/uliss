import {EditorToolbar} from '@uliss/design-system'
import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

function renderToolbar(props: Partial<Parameters<typeof EditorToolbar>[0]> = {}) {
    const onCommand = vi.fn()
    const onOriginalChange = vi.fn()
    render(<EditorToolbar onCommand={onCommand} original={false} onOriginalChange={onOriginalChange} {...props}/>)
    return {onCommand, onOriginalChange}
}

describe('EditorToolbar', () => {
    it('is one labelled toolbar of named buttons', () => {
        renderToolbar()

        const toolbar = screen.getByRole('toolbar', {name: 'Formatting'})
        const names = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
        expect(names).toEqual(['Bold', 'Italic', 'Heading', 'Bulleted list', 'Numbered list', 'Undo', 'Redo', 'Original'])
    })

    it('sends the command of the pressed button', () => {
        const {onCommand} = renderToolbar()

        fireEvent.click(screen.getByRole('button', {name: 'Numbered list'}))
        fireEvent.click(screen.getByRole('button', {name: 'Undo'}))

        expect(onCommand.mock.calls).toEqual([['orderedList'], ['undo']])
    })

    it('marks formats active at the caret as pressed, and only formats', () => {
        renderToolbar({active: {bold: true, heading: true}})

        expect(screen.getByRole('button', {name: 'Bold'})).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', {name: 'Italic'})).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByRole('button', {name: 'Heading'})).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', {name: 'Undo'})).not.toHaveAttribute('aria-pressed')
    })

    it('disables commands that cannot run now', () => {
        const {onCommand} = renderToolbar({unavailable: {redo: true}})

        const redo = screen.getByRole('button', {name: 'Redo'})
        expect(redo).toBeDisabled()
        fireEvent.click(redo)
        expect(onCommand).not.toHaveBeenCalled()
    })

    it('toggles the original and disables formatting while it is shown', () => {
        const {onOriginalChange} = renderToolbar({original: true})

        const original = screen.getByRole('button', {name: 'Original'})
        expect(original).toHaveAttribute('aria-pressed', 'true')
        expect(original).toBeEnabled()
        for (const name of ['Bold', 'Italic', 'Heading', 'Bulleted list', 'Numbered list', 'Undo', 'Redo']) {
            expect(screen.getByRole('button', {name})).toBeDisabled()
        }
        fireEvent.click(original)
        expect(onOriginalChange).toHaveBeenCalledWith(false)
    })

    it('disables every button when the whole editor is locked', () => {
        renderToolbar({disabled: true})

        for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    })
})
