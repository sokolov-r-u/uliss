import {type EditorCommand, EditorToolbar} from '@uliss/design-system'
import {type Editor, EditorContent, useEditor, useEditorState} from '@tiptap/react'
import {type Ref, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState} from 'react'
import {findScrollParent} from '../../lib/scrollParent'
import {MarkdownContent} from '../../ui/MarkdownContent'
import {noteEditorExtensions} from './noteEditorExtensions'
import './note-editor.css'

export interface NoteEditorChange {
    markdown: string
    /** False when the text matches the saved note, including after undoing every edit. */
    changed: boolean
}

/** What the edit form does to the text from outside the editor, e.g. with a model rewrite. */
export interface NoteEditorHandle {
    /** The text as the editor holds it now. */
    getMarkdown: () => string
    /** Replaces the whole text as one undo step; false (and no step) when it reads the same as the current text. */
    replaceText: (markdown: string) => boolean
}

interface NoteEditorProps {
    /** The saved Markdown; also what Original shows. Read once, when the editor is created. */
    content: string
    onChange: (change: NoteEditorChange) => void
    /** Read-only text and toolbar, e.g. while the note is being rewritten elsewhere. */
    locked?: boolean
    highlightDateHeadings?: boolean
    /** Text arriving from the model: shown read-only in place of the editor while not null. */
    preview?: string | null
    handleRef?: Ref<NoteEditorHandle>
}

const COMMANDS: Record<EditorCommand, (editor: Editor) => void> = {
    bold: (editor) => editor.chain().focus().toggleBold().run(),
    italic: (editor) => editor.chain().focus().toggleItalic().run(),
    // Pressed reads any heading level; pressing it again must return any of them to text, not convert it to h2.
    heading: (editor) => editor.isActive('heading')
        ? editor.chain().focus().setParagraph().run()
        : editor.chain().focus().setHeading({level: 2}).run(),
    bulletList: (editor) => editor.chain().focus().toggleBulletList().run(),
    orderedList: (editor) => editor.chain().focus().toggleOrderedList().run(),
    undo: (editor) => editor.chain().focus().undo().run(),
    redo: (editor) => editor.chain().focus().redo().run(),
}

/** Visual Markdown editor of a note: the user formats with the toolbar and never sees Markdown syntax. */
export function NoteEditor({
                               content,
                               onChange,
                               locked = false,
                               highlightDateHeadings = false,
                               preview = null,
                               handleRef,
                           }: NoteEditorProps) {
    const [original, setOriginal] = useState(false)
    const rootRef = useRef<HTMLDivElement>(null)
    // Where each view was left: switching back returns to it; the original opens at the top the first time.
    const scrollTopRef = useRef({text: 0, original: 0})
    const restoreScrollRef = useRef(false)
    const onChangeRef = useRef(onChange)
    useLayoutEffect(() => {
        onChangeRef.current = onChange
    })
    // What the editor writes for the untouched note: the editor may spell equivalent Markdown differently.
    const baselineRef = useRef<string | null>(null)

    const extensions = useMemo(noteEditorExtensions, [])
    const editor = useEditor({
        extensions,
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

    // The model's text replaces what the editor shows, so the original must not cover it.
    const previewing = preview !== null
    useEffect(() => {
        if (previewing) switchView(false)
    }, [previewing]) // switchView is redefined each render but only reads refs and the current view

    function switchView(showOriginal: boolean) {
        if (showOriginal === original) return
        const scroller = findScrollParent(rootRef.current)
        if (scroller) scrollTopRef.current[original ? 'original' : 'text'] = scroller.scrollTop
        restoreScrollRef.current = true
        setOriginal(showOriginal)
    }

    useLayoutEffect(() => {
        if (!restoreScrollRef.current) return
        restoreScrollRef.current = false
        const scroller = findScrollParent(rootRef.current)
        if (scroller) scroller.scrollTop = scrollTopRef.current[original ? 'original' : 'text']
    }, [original])

    useImperativeHandle(handleRef, () => ({
        getMarkdown: () => editor?.getMarkdown().trim() ?? '',
        replaceText: (markdown) => {
            if (!editor) return false
            const before = editor.getMarkdown().trim()
            editor.commands.setContent(markdown, {contentType: 'markdown'})
            if (editor.getMarkdown().trim() !== before) return true
            editor.commands.undo()
            return false
        },
    }), [editor])

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

    return <div className="note-editor" ref={rootRef}>
        <EditorToolbar
            onCommand={(command) => editor && COMMANDS[command](editor)}
            active={state?.active}
            unavailable={state?.unavailable}
            original={original}
            onOriginalChange={switchView}
            disabled={locked || !editor}
            style={{position: 'sticky', top: 0, zIndex: 1}}
        />
        {/* Hidden, not unmounted: the editor keeps its text and history while the original is shown. */}
        <div className="note-editor-text markdown-content" hidden={original || previewing}>
            <EditorContent editor={editor}/>
        </div>
        {previewing && <section className="note-editor-preview" aria-label="Text from Uliss" aria-busy="true">
            <MarkdownContent content={preview} pending highlightDateHeadings={highlightDateHeadings}/>
        </section>}
        {original && <section className="note-editor-original" aria-label="Original note">
            <MarkdownContent content={content} highlightDateHeadings={highlightDateHeadings}/>
        </section>}
    </div>
}
