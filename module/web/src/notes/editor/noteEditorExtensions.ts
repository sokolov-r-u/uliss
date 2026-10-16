import type {Extensions} from '@tiptap/core'
import {TableKit} from '@tiptap/extension-table'
import {Markdown} from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

/**
 * Everything a note's Markdown may contain, not only what the toolbar inserts: a table or a code block the model wrote
 * must survive an edit. HTML in the Markdown is reduced to these nodes; tags without one (script, iframe) are dropped.
 */
export function noteEditorExtensions(): Extensions {
    return [
        StarterKit.configure({
            // Links stay as written; a click in the editor must place the caret, not navigate.
            link: {openOnClick: false, autolink: false},
            underline: false,
        }),
        TableKit,
        Markdown.configure({markedOptions: {gfm: true}}),
    ]
}
