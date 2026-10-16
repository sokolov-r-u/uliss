import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {NoteEditor} from './NoteEditor'

function renderEditor(content = 'A thought', locked = false) {
    const onChange = vi.fn()
    const view = render(<NoteEditor content={content} onChange={onChange} locked={locked}/>)
    return {onChange, ...view}
}

const lastChange = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0]

describe('NoteEditor', () => {
    it('shows the note as editable text under the formatting toolbar', async () => {
        renderEditor('The **late** Bowie')

        const text = await screen.findByRole('textbox', {name: 'Note text'})
        expect(text).toHaveAttribute('contenteditable', 'true')
        expect(text.querySelector('strong')).toHaveTextContent('late')
        expect(screen.getByRole('toolbar', {name: 'Formatting'})).toBeInTheDocument()
    })

    it('reports a toolbar edit as changed Markdown', async () => {
        const {onChange} = renderEditor()
        await screen.findByRole('textbox', {name: 'Note text'})

        fireEvent.click(screen.getByRole('button', {name: 'Bulleted list'}))

        await waitFor(() => expect(lastChange(onChange)).toEqual({markdown: '- A thought', changed: true}))
        expect(screen.getByRole('button', {name: 'Bulleted list'})).toHaveAttribute('aria-pressed', 'true')
    })

    it('reads as unchanged again once the edit is undone', async () => {
        const {onChange} = renderEditor()
        await screen.findByRole('textbox', {name: 'Note text'})
        fireEvent.click(screen.getByRole('button', {name: 'Heading'}))
        await waitFor(() => expect(lastChange(onChange)).toEqual({markdown: '## A thought', changed: true}))

        fireEvent.click(screen.getByRole('button', {name: 'Undo'}))

        await waitFor(() => expect(lastChange(onChange)).toEqual({markdown: 'A thought', changed: false}))
    })

    it('does not count the editor rewriting equivalent Markdown as a change', async () => {
        const {onChange} = renderEditor('* starred item\n* another')
        await screen.findByRole('textbox', {name: 'Note text'})

        fireEvent.click(screen.getByRole('button', {name: 'Heading'}))
        fireEvent.click(screen.getByRole('button', {name: 'Undo'}))

        await waitFor(() => expect(lastChange(onChange)?.changed).toBe(false))
    })

    it('swaps in the saved version while Original is on and keeps the edits', async () => {
        renderEditor('Saved text')
        await screen.findByRole('textbox', {name: 'Note text'})
        fireEvent.click(screen.getByRole('button', {name: 'Bulleted list'}))

        fireEvent.click(screen.getByRole('button', {name: 'Original'}))

        expect(screen.queryByRole('textbox', {name: 'Note text'})).toBeNull()
        const original = screen.getByRole('region', {name: 'Original note'})
        expect(original).toHaveTextContent('Saved text')
        expect(original.querySelector('ul')).toBeNull()

        fireEvent.click(screen.getByRole('button', {name: 'Original'}))

        const text = screen.getByRole('textbox', {name: 'Note text'})
        expect(text).toBeVisible()
        expect(text.querySelector('ul')).not.toBeNull()
    })

    it('reports nothing when only the lock changes', async () => {
        const onChange = vi.fn()
        const {rerender} = render(<NoteEditor content="Steady" onChange={onChange}/>)
        await screen.findByRole('textbox', {name: 'Note text'})

        await act(async () => rerender(<NoteEditor content="Steady" onChange={onChange} locked/>))
        await act(async () => rerender(<NoteEditor content="Steady" onChange={onChange}/>))

        expect(onChange).not.toHaveBeenCalled()
    })

    it('locks the text and the toolbar', async () => {
        renderEditor('Busy', true)

        const text = await screen.findByRole('textbox', {name: 'Note text'})
        expect(text).toHaveAttribute('contenteditable', 'false')
        for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    })

    it('unlocks when the lock is lifted', async () => {
        const onChange = vi.fn()
        const {rerender} = render(<NoteEditor content="Busy" onChange={onChange} locked/>)
        await screen.findByRole('textbox', {name: 'Note text'})

        await act(async () => rerender(<NoteEditor content="Busy" onChange={onChange}/>))

        expect(screen.getByRole('textbox', {name: 'Note text'})).toHaveAttribute('contenteditable', 'true')
        expect(screen.getByRole('button', {name: 'Bold'})).toBeEnabled()
    })
})
