import {useEffect, useRef, useState} from 'react'
import {Button, Dialog, TextField} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {NoteEditor, type NoteEditorChange} from './editor/NoteEditor'
import {type Note, NoteApiError, notifyNotesChanged, updateNote} from './noteApi'

const TITLE_LIMIT = 50

export type EditableNote = Note & { content: string; version: number }

interface NoteEditFormProps {
    note: EditableNote
    onSaved: (note: Note) => void
    onClose: () => void
}

/** Mirrors the server rule: trimmed, whitespace runs collapsed, 1–50 code points. */
function normalizeTitle(raw: string): string | null {
    const title = raw.trim().replace(/\s+/g, ' ')
    const length = Array.from(title).length
    return length > 0 && length <= TITLE_LIMIT ? title : null
}

function saveFailure(error: unknown): string {
    if (error instanceof NoteApiError && error.kind === 'http') {
        if (error.code === 'NOTE_VERSION_CONFLICT') return 'This note changed elsewhere. Copy your edits and reload.'
        if (error.code === 'NOTE_UPDATING') return 'Uliss is updating this note. Save again when it finishes.'
        if (error.status === 404 || error.code === 'NOTE_NOT_READY') return 'This note can no longer be edited.'
        if (error.status === 400) return 'Use a title of 1 to 50 characters and a text of up to 100,000 characters.'
    }
    return error instanceof Error ? error.message : String(error)
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

    const normalizedTitle = normalizeTitle(title)
    const dirty = text.changed || title !== initialTitle
    const canSave = dirty && !saving && normalizedTitle !== null && text.markdown.trim() !== ''

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

    return <div className="note-edit">
        <TextField label="Title" value={title} maxLength={TITLE_LIMIT} disabled={saving}
                   onChange={(event) => setTitle(event.target.value)}/>
        <NoteEditor content={note.content} onChange={setText} locked={saving}
                    highlightDateHeadings={note.source === 'CHAT_SUMMARY'}/>
        <div className="note-edit-actions">
            {error && <p className="note-edit-error" role="alert">{error}</p>}
            <Button variant="ghost" disabled={saving}
                    onClick={() => (dirty ? setConfirmingDiscard(true) : onClose())}>Cancel</Button>
            <Button variant="outline" disabled={!canSave} aria-busy={saving}
                    onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
        {confirmingDiscard && <Dialog title="Discard your edits?" body="The note stays as it was last saved."
                                      confirm="Discard" cancel="Keep editing"
                                      onConfirm={onClose} onCancel={() => setConfirmingDiscard(false)}/>}
    </div>
}
