import {useEffect, useRef, useState} from 'react'
import {Button, Dialog, TextField} from '@uliss/design-system'
import {describeError} from '../lib/apiHelpers'
import {AuthRequiredError} from '../auth/apiClient'
import {normalizeTitle, TITLE_LIMIT} from '../lib/titleRule'
import {ChatComposer} from '../chat/ChatComposer'
import {NoteEditor, type NoteEditorChange, type NoteEditorHandle} from './editor/NoteEditor'
import {
    AI_EDIT_CONTENT_LIMIT,
    AI_EDIT_INSTRUCTION_LIMIT,
    isAbortError,
    type Note,
    NoteApiError,
    notifyNotesChanged,
    streamNoteAiEdit,
    updateNote,
} from './noteApi'

export type EditableNote = Note & { content: string; version: number }

/** A ready note with a version can be edited; anything else cannot. */
export function asEditable(note: Note): EditableNote | null {
    if (note.status !== 'READY' || note.content == null || note.version === undefined) return null
    return {...note, content: note.content, version: note.version}
}

interface NoteEditFormProps {
    note: EditableNote
    onSaved: (note: Note) => void
    onClose: () => void
}

function saveFailure(error: unknown): string {
    if (error instanceof NoteApiError && error.kind === 'http') {
        if (error.code === 'NOTE_VERSION_CONFLICT') return 'This note changed elsewhere. Copy your edits and reload.'
        if (error.code === 'NOTE_UPDATING') return 'Uliss is updating this note. Save again when it finishes.'
        if (error.status === 404 || error.code === 'NOTE_NOT_READY') return 'This note can no longer be edited.'
        if (error.status === 400) return 'Use a title of 1 to 50 characters and a text of up to 100,000 characters.'
    }
    return describeError(error)
}

/** Examples of what the command field is for; shown one at a time as its placeholder. */
const COMMAND_HINTS = [
    "Fix spelling and punctuation, don't change the wording…",
    "Format the text: headings, lists, paragraphs; don't change the wording…",
    'Make it shorter…',
    'Turn the lists into a table…',
]

function nextHint(current: number): number {
    if (COMMAND_HINTS.length < 2) return 0
    const step = 1 + Math.floor(Math.random() * (COMMAND_HINTS.length - 1))
    return (current + step) % COMMAND_HINTS.length
}

function rewriteFailure(error: unknown): string {
    if (error instanceof NoteApiError) {
        if (error.code === 'NOTE_UPDATING') return 'Uliss is updating this note. Try again when it finishes.'
        if (error.status === 404 || error.code === 'NOTE_NOT_READY') return 'This note can no longer be edited.'
        if (error.status === 400) {
            return 'Use a command of up to 1,000 characters and a text of up to 30,000 characters.'
        }
        if (error.kind === 'transport') return 'Uliss is unavailable. Try again.'
    }
    return 'Uliss could not rewrite the text. Try again.'
}

/** Title and text of a ready note in edit mode: Save sends both with the version the edit started from. */
export function NoteEditForm({note, onSaved, onClose}: NoteEditFormProps) {
    const initialTitle = note.title ?? ''
    const [title, setTitle] = useState(initialTitle)
    const [text, setText] = useState<NoteEditorChange>({markdown: note.content, changed: false})
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [confirmingDiscard, setConfirmingDiscard] = useState(false)
    const savingRef = useRef(false)
    const editorRef = useRef<NoteEditorHandle>(null)
    const [command, setCommand] = useState('')
    const [hint, setHint] = useState(() => Math.floor(Math.random() * COMMAND_HINTS.length))
    const [preview, setPreview] = useState<string | null>(null)
    const [rewriteNotice, setRewriteNotice] = useState<string | null>(null)
    const rewriteRef = useRef<AbortController | null>(null)
    const generating = preview !== null

    const normalizedTitle = normalizeTitle(title)
    const dirty = text.changed || title !== initialTitle
    const canSave = dirty && !saving && !generating && normalizedTitle !== null && text.markdown.trim() !== ''
    const busy = saving || generating

    // Leaving the screen stops the model; the server cancels the provider call with the connection.
    useEffect(() => () => rewriteRef.current?.abort(), [])

    useEffect(() => {
        if (!dirty) return
        const warn = (event: BeforeUnloadEvent) => event.preventDefault()
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [dirty])

    async function save() {
        if (!canSave || normalizedTitle === null || savingRef.current) return
        savingRef.current = true
        setSaving(true)
        setError(null)
        try {
            // Untouched text goes back as stored, not in the editor's equivalent spelling.
            const content = text.changed ? text.markdown : note.content
            const savedNote = await updateNote(note.id, {title: normalizedTitle, content, version: note.version})
            notifyNotesChanged()
            onSaved(savedNote)
        } catch (e) {
            if (!(e instanceof AuthRequiredError)) setError(saveFailure(e))
        } finally {
            savingRef.current = false
            setSaving(false)
        }
    }

    async function rewrite(text?: string) {
        const instruction = (text ?? command).trim()
        const editor = editorRef.current
        if (instruction === '' || busy || editor === null || rewriteRef.current !== null) return
        const content = editor.getMarkdown()
        setError(null)
        if (instruction.length > AI_EDIT_INSTRUCTION_LIMIT) {
            setRewriteNotice('Keep the command under 1,000 characters.')
            return
        }
        if (content === '') {
            setRewriteNotice('Write some text first.')
            return
        }
        if (content.length > AI_EDIT_CONTENT_LIMIT) {
            setRewriteNotice('Note is too long for Uliss to edit (30,000 characters at most).')
            return
        }
        const controller = new AbortController()
        rewriteRef.current = controller
        setRewriteNotice(null)
        setHint(nextHint)
        setPreview('')
        let result = ''
        // One render per frame: every render re-parses the whole Markdown received so far.
        let frame: number | null = null
        try {
            const outcome = await streamNoteAiEdit(note.id, {instruction, content}, {
                signal: controller.signal,
                onText: (chunk) => {
                    result += chunk
                    frame ??= requestAnimationFrame(() => {
                        frame = null
                        setPreview(result)
                    })
                },
            })
            if (outcome === 'done' && result.trim() !== '') {
                // Text from a stopped or failed stream is dropped: half a note must not be saved by mistake.
                const changed = editorRef.current?.replaceText(result) ?? false
                setCommand('')
                if (!changed) setRewriteNotice('Nothing changed.')
            } else {
                setRewriteNotice('Uliss could not rewrite the text. Try again.')
            }
        } catch (e) {
            if (isAbortError(e)) {
                if (rewriteRef.current === controller) setRewriteNotice('Stopped.')
            } else if (!(e instanceof AuthRequiredError)) {
                setRewriteNotice(rewriteFailure(e))
            }
        } finally {
            if (frame !== null) cancelAnimationFrame(frame)
            if (rewriteRef.current === controller) rewriteRef.current = null
            setPreview(null)
        }
    }

    return <div className="note-edit">
        <TextField label="Title" value={title} maxLength={TITLE_LIMIT} disabled={busy}
                   onChange={(event) => setTitle(event.target.value)}/>
        <NoteEditor content={note.content} onChange={setText} locked={busy} preview={preview}
                    handleRef={editorRef} highlightDateHeadings={note.source === 'CHAT_SUMMARY'}/>
        <div className="note-edit-dock">
            {rewriteNotice && <p className="note-edit-notice" role="status">{rewriteNotice}</p>}
            <ChatComposer value={command} onChange={setCommand} onSubmit={(text) => void rewrite(text)}
                          placeholder={COMMAND_HINTS[hint]} disabled={saving}
                          generationActive={generating} onStop={() => rewriteRef.current?.abort()}/>
            <div className="note-edit-actions">
                {error && <p className="note-edit-error" role="alert">{error}</p>}
                <Button variant="ghost" disabled={busy}
                        onClick={() => (dirty ? setConfirmingDiscard(true) : onClose())}>Cancel</Button>
                <Button variant="outline" disabled={!canSave} aria-busy={saving}
                        onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
        </div>
        {confirmingDiscard && <Dialog title="Discard your edits?" body="The note stays as it was last saved."
                                      confirm="Discard" cancel="Keep editing"
                                      onConfirm={onClose} onCancel={() => setConfirmingDiscard(false)}/>}
    </div>
}
