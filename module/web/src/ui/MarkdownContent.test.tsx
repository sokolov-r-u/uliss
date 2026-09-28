import {render, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {describe, expect, it} from 'vitest'
import {Bubble} from '../chat/Bubble'
import {NoteDetailView} from '../notes/NoteDetailPage'
import type {Note} from '../notes/noteApi'
import {MarkdownContent} from './MarkdownContent'

describe('MarkdownContent', () => {
    it('renders CommonMark and GFM content with safe external links', () => {
        render(<MarkdownContent content={`# Result

**Important** text with [reference](https://example.com/docs).

- first
- second

| Name | Value |
| --- | --- |
| answer | 42 |

\`\`\`kotlin
val answer = 42
\`\`\``}/>)

        expect(screen.getByRole('heading', {name: 'Result', level: 1})).toBeInTheDocument()
        expect(screen.getByText('Important').tagName).toBe('STRONG')
        expect(screen.getAllByRole('listitem')).toHaveLength(2)
        expect(screen.getByRole('table')).toBeInTheDocument()
        expect(screen.getByText('val answer = 42')).toHaveClass('language-kotlin')
        expect(screen.getByRole('link', {name: 'reference'})).toHaveAttribute('target', '_blank')
        expect(screen.getByRole('link', {name: 'reference'})).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('drops raw HTML and images and does not expose an unsafe URL', () => {
        const view = render(<MarkdownContent content={`Before

<script>alert('raw')</script>

![tracking pixel](https://example.com/pixel.gif)

[unsafe](javascript:alert('link'))`}/>)

        expect(view.container.querySelector('script')).not.toBeInTheDocument()
        expect(view.container.querySelector('img')).not.toBeInTheDocument()
        expect(screen.queryByText('tracking pixel')).not.toBeInTheDocument()
        expect(screen.getByText('unsafe')).not.toHaveAttribute('href')
        expect(screen.getByText('unsafe')).not.toHaveAttribute('node')
    })
})

describe('AI Markdown boundaries', () => {
    it('renders assistant Markdown while preserving user content as plain text', () => {
        render(<>
            <Bubble id="assistant" role="ASSISTANT" status="COMPLETE" content="**assistant**"/>
            <Bubble id="user" role="USER" status="COMPLETE" content="**user**"/>
        </>)

        expect(screen.getByText('assistant').tagName).toBe('STRONG')
        expect(screen.getByText('**user**')).toBeInTheDocument()
    })

    it('renders generated notes as Markdown while preserving manual notes as plain text', () => {
        const generated = {
            id: 'generated',
            source: 'CHAT_SUMMARY',
            status: 'READY',
            content: '# Generated',
        } satisfies Note
        const manual = {
            id: 'manual',
            source: 'MANUAL',
            status: 'READY',
            content: '# Manual',
        } satisfies Note
        const view = render(<MemoryRouter><NoteDetailView state={{status: 'ready', note: generated}}/></MemoryRouter>)

        expect(screen.getByRole('heading', {name: 'Generated', level: 1})).toBeInTheDocument()

        view.rerender(<MemoryRouter><NoteDetailView state={{status: 'ready', note: manual}}/></MemoryRouter>)
        expect(screen.getByText('# Manual')).toBeInTheDocument()
        expect(screen.queryByRole('heading', {name: 'Manual'})).not.toBeInTheDocument()
    })
})
