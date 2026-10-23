import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {NoteTitle, noteTitleText} from './NoteTitle'
import {ListRow} from './ListRow'

const slot = (container: HTMLElement) => container.querySelector('[data-note-icon]')

describe('NoteTitle', () => {
    it('puts the icon before the name', () => {
        const {container} = render(<NoteTitle title="Giant Steps" icon="🎷"/>)

        expect(container).toHaveTextContent('🎷 Giant Steps')
        expect(slot(container)).toHaveTextContent('🎷')
    })

    it('in a list keeps an empty slot of the same width for a note without an icon', () => {
        const withIcon = render(<NoteTitle title="Giant Steps" icon="🎷" slot/>).container
        const without = render(<NoteTitle title="Blue Train" icon={null} slot/>).container

        const empty = slot(without)
        expect(empty).toBeInTheDocument()
        expect(empty).toBeEmptyDOMElement()
        expect(empty).toHaveAttribute('aria-hidden', 'true')
        expect(empty?.getAttribute('style')).toBe(slot(withIcon)?.getAttribute('style'))
        expect(without).toHaveTextContent(/^Blue Train$/)
    })

    it('alone, a note without an icon is just its name', () => {
        const {container} = render(<NoteTitle title="Blue Train" icon={null}/>)

        expect(slot(container)).not.toBeInTheDocument()
        expect(container).toHaveTextContent(/^Blue Train$/)
    })

    it('spells the name with its icon for labels and paths', () => {
        expect(noteTitleText('Giant Steps', '🎷')).toBe('🎷 Giant Steps')
        expect(noteTitleText('Blue Train', null)).toBe('Blue Train')
        expect(noteTitleText('Blue Train', undefined)).toBe('Blue Train')
    })
})

describe('ListRow icon', () => {
    it('shows a note icon before the title and a slot for a note without one', () => {
        const {container: withIcon} = render(<ListRow title="Giant Steps" icon="🎷" onClick={() => undefined}/>)
        const {container: without} = render(<ListRow title="Blue Train" icon={null} onClick={() => undefined}/>)

        expect(screen.getByRole('button', {name: '🎷 Giant Steps'})).toBeInTheDocument()
        expect(slot(withIcon)).toHaveTextContent('🎷')
        expect(slot(without)).toBeEmptyDOMElement()
    })

    it('keeps rows without an icon prop (chats) free of the slot', () => {
        const {container} = render(<ListRow title="A chat" onClick={() => undefined}/>)

        expect(slot(container)).not.toBeInTheDocument()
    })
})
