import {Editor} from '@tiptap/core'
import {renderToStaticMarkup} from 'react-dom/server'
import {afterEach, describe, expect, it} from 'vitest'
import {MarkdownContent} from '../../ui/MarkdownContent'
import {noteEditorExtensions} from './noteEditorExtensions'

const editors: Editor[] = []

afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

function throughEditor(markdown: string): string {
    const editor = new Editor({extensions: noteEditorExtensions(), content: markdown, contentType: 'markdown'})
    editors.push(editor)
    return editor.getMarkdown()
}

const rendered = (markdown: string) => renderToStaticMarkup(<MarkdownContent content={markdown} highlightDateHeadings/>)

/** Shapes a note takes today: summaries with dated addenda, and whatever Markdown the model chose to write. */
const NOTES: Record<string, string> = {
    'summary with a dated addendum': [
        'The user prefers **late Bowie** to the *Berlin* trilogy.',
        '',
        '- Blackstar reads as a farewell',
        '- Lazarus is the strongest track',
        '',
        '---',
        '',
        '## 2026-10-17',
        '',
        'They changed their mind about Low.',
    ].join('\n'),
    'headings of several levels': '# Title\n\n## Part\n\n### Detail\n\ntext',
    'nested and ordered lists': '1. first\n2. second\n   - inner a\n   - inner b\n3. third',
    'table': '| Album | Year |\n| --- | --- |\n| Low | 1977 |\n| Blackstar | 2016 |',
    'fenced code': '```kotlin\nval x = 1\n```\n\nafter',
    'inline code and link': 'Use `gradle` from [the docs](https://gradle.org).',
    'quote': '> a quoted thought\n> on two lines\n\nafter',
    'strikethrough': 'This was ~~wrong~~ right.',
    'cyrillic text': 'Пользователь **передумал** насчёт альбома.',
}

describe('noteEditorExtensions', () => {
    it('drops script and other raw HTML instead of carrying it into the saved Markdown', () => {
        const saved = throughEditor('before\n\n<script>alert(1)</script>\n\n<iframe src="https://x.test"></iframe>\n\nafter')

        expect(saved).not.toMatch(/<script|<iframe|alert\(1\)/)
        expect(saved).toContain('before')
        expect(saved).toContain('after')
    })

    for (const [shape, markdown] of Object.entries(NOTES)) {
        it(`keeps ${shape} rendering the same after a pass through the editor`, () => {
            expect(rendered(throughEditor(markdown))).toBe(rendered(markdown))
        })

        it(`reaches a fixed point for ${shape} after one pass`, () => {
            const once = throughEditor(markdown)
            expect(throughEditor(once)).toBe(once)
        })
    }
})
