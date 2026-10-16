import {type EditorCommand, EditorToolbar} from '@uliss/design-system'
import {type Editor, EditorContent, useEditor, useEditorState} from '@tiptap/react'
import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import {MarkdownContent} from '../../ui/MarkdownContent'
import {noteEditorExtensions} from './noteEditorExtensions'
import './note-editor.css'

export interface NoteEditorChange {
    markdown: string
    /** False when the text matches the saved note, including after undoing every edit. */
    changed: boolean
}

interface NoteEditorProps {
    /** The saved Markdown; also what Original shows. Read once, when the editor is created. */
    content: string
    onChange: (change: NoteEditorChange) => void
    /** Read-only text and toolbar, e.g. while the note is being rewritten elsewhere. */
    locked?: boolean
    highlightDateHeadings?: boolean
}

const COMMANDS: Record<EditorCommand, (editor: Editor) => void> = {
    bold: (editor) => editor.chain().focus().toggleBold().run(),
    italic: (editor) => editor.chain().focus().toggleItalic().run(),
    heading: (editor) => editor.chain().focus().toggleHeading({level: 2}).run(),
    bulletList: (editor) => editor.chain().focus().toggleBulletList().run(),
    orderedList: (editor) => editor.chain().focus().toggleOrderedList().run(),
    undo: (editor) => editor.chain().focus().undo().run(),
    redo: (editor) => editor.chain().focus().redo().run(),
}

/** Visual Markdown editor of a note: the user formats with the toolbar and never sees Markdown syntax. */
export function NoteEditor({content, onChange, locked = false, highlightDateHeadings = false}: NoteEditorProps) {
    const [original, setOriginal] = useState(false)
    const onChangeRef = useRef(onChange)
    useLayoutEffect(() => {
        onChangeRef.current = onChange
    })
    // What the editor writes for the untouched note: the editor may spell equivalent Markdown differently.
    const baselineRef = useRef<string | null>(null)

    const editor = useEditor({
        extensions: noteEditorExtensions(),
        content,
        contentType: 'markdown',
        editable: !locked,
        editorProps: {
            attributes: {role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Note text'},
        },
        onCreate: ({editor}) => {
            baselineRef.current = editor.getMarkdown().trim()
        },
        onUpdate: ({editor, transaction}) => {
            // setEditable also emits an update, before onCreate has recorded the baseline: only text changes count.
            if (!transaction.docChanged) return
            // Blank lines around the document carry nothing; the service trims the end as well.
            const markdown = editor.getMarkdown().trim()
            onChangeRef.current({markdown, changed: markdown !== baselineRef.current})
        },
    })

    useEffect(() => {
        editor?.setEditable(!locked)
    }, [editor, locked])

    const state = useEditorState({
        editor,
        selector: ({editor}) => editor && {
            active: {
                bold: editor.isActive('bold'),
                italic: editor.isActive('italic'),
                heading: editor.isActive('heading'),
                bulletList: editor.isActive('bulletList'),
                orderedList: editor.isActive('orderedList'),
            },
            unavailable: {undo: !editor.can().undo(), redo: !editor.can().redo()},
        },
    })

    return <div className="note-editor">
        <EditorToolbar
            onCommand={(command) => editor && COMMANDS[command](editor)}
            active={state?.active}
            unavailable={state?.unavailable}
            original={original}
            onOriginalChange={setOriginal}
            disabled={locked || !editor}
            style={{position: 'sticky', top: 0, zIndex: 1}}
        />
        {/* Hidden, not unmounted: the editor keeps its text and history while the original is shown. */}
        <div className="note-editor-text markdown-content" hidden={original}>
            <EditorContent editor={editor}/>
        </div>
        {original && <section className="note-editor-original" aria-label="Original note">
            <MarkdownContent content={content} highlightDateHeadings={highlightDateHeadings}/>
        </section>}
    </div>
}
