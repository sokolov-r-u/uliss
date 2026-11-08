import {useEffect, useRef, useState} from 'react'
import {Link} from 'react-router-dom'
import {Button, Dialog, IconPicker, type Locale, TextField, useLocale, useMessages} from '@uliss/design-system'
import {describeError} from '../lib/apiHelpers'
import {AuthRequiredError} from '../auth/apiClient'
import {normalizeTitle, TITLE_LIMIT} from '../lib/titleRule'
import {EMOJI_DATA_URL} from '../lib/emojiData'
import {ChatComposer} from '../chat/ChatComposer'
import {NoteEditor, type NoteEditorChange, type NoteEditorHandle} from './editor/NoteEditor'
import {
    AI_EDIT_CONTENT_LIMIT,
    AI_EDIT_INSTRUCTION_LIMIT,
    createNote,
    isAbortError,
    type Note,
    NoteAlreadyCreatedError,
    NoteApiError,
    notifyNotesChanged,
    streamNoteAiEdit,
    updateNote,
} from './noteApi'
import {HINT_COUNT, noteEditMessages} from './noteEdit.messages'
import {generateClientUuid} from '../lib/clientUuid'
import {useLeaveGuard} from '../ui/useLeaveGuard'

export type EditableNote = Note & { content: string; version: number }

/** A ready note with a version can be edited; anything else cannot. */
export function asEditable(note: Note): EditableNote | null {
    if (note.status !== 'READY' || note.content == null || note.version === undefined) return null
    return {...note, content: note.content, version: note.version}
}

interface NoteEditFormProps {
    /** The ready note being edited; null writes a new note. */
    note: EditableNote | null
    onSaved: (note: Note) => void
    onClose: () => void
}

type EditWords = typeof noteEditMessages.en

function saveFailure(error: unknown, t: EditWords, locale: Locale): string {
    if (error instanceof NoteApiError && error.kind === 'http') {
        if (error.code === 'NOTE_VERSION_CONFLICT') return t.conflict
        if (error.code === 'NOTE_UPDATING') return t.updatingSave
        if (error.status === 404 || error.code === 'NOTE_NOT_READY') return t.notEditable
        if (error.status === 400) return t.invalid
    }
    return describeError(error, locale)
}

function nextHint(current: number): number {
    if (HINT_COUNT < 2) return 0
    const step = 1 + Math.floor(Math.random() * (HINT_COUNT - 1))
    return (current + step) % HINT_COUNT
}

function rewriteFailure(error: unknown, t: EditWords): string {
    if (error instanceof NoteApiError) {
        if (error.code === 'NOTE_UPDATING') return t.updatingRewrite
        if (error.status === 404 || error.code === 'NOTE_NOT_READY') return t.notEditable
        if (error.status === 400) return t.rewriteInvalid
        if (error.kind === 'transport') return t.unavailable
    }
    return t.rewriteFailed
}

/**
 * Icon, title and text of a note. Editing a ready note, Save sends them with the version the edit started from; for a
 * new note (no [NoteEditFormProps.note]) it creates one, without the model rewrite. Unsaved changes hold every way out.
 */
export function NoteEditForm({note, onSaved, onClose}: NoteEditFormProps) {
    const locale = useLocale()
    const t = useMessages(noteEditMessages)
    const initialTitle = note?.title ?? ''
    const [title, setTitle] = useState(initialTitle)
    const initialIcon = note?.icon ?? null
    const [icon, setIcon] = useState<string | null>(initialIcon)
    const initialContent = note?.content ?? ''
    const [text, setText] = useState<NoteEditorChange>({markdown: initialContent, changed: false})
    // one key per new note: a retry after a lost response finds the note the first request made
    const [createKey] = useState(generateClientUuid)
    const [savedElsewhere, setSavedElsewhere] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [confirmingDiscard, setConfirmingDiscard] = useState(false)
    const savingRef = useRef(false)
    const editorRef = useRef<NoteEditorHandle>(null)
    const [command, setCommand] = useState('')
    const [hint, setHint] = useState(() => Math.floor(Math.random() * HINT_COUNT))
    const [preview, setPreview] = useState<string | null>(null)
    const [rewriteNotice, setRewriteNotice] = useState<string | null>(null)
    const rewriteRef = useRef<AbortController | null>(null)
    const generating = preview !== null

    const normalizedTitle = normalizeTitle(title)
    const dirty = text.changed || title !== initialTitle || icon !== initialIcon
    const canSave = dirty && !saving && !generating && normalizedTitle !== null && text.markdown.trim() !== ''
    const busy = saving || generating

    // Leaving the screen stops the model; the server cancels the provider call with the connection.
    useEffect(() => () => rewriteRef.current?.abort(), [])

    const {blocker, release} = useLeaveGuard(dirty)
    const leaving = blocker.state === 'blocked'

    async function save() {
        if (!canSave || normalizedTitle === null || savingRef.current) return
        savingRef.current = true
        setSaving(true)
        setError(null)
        setSavedElsewhere(null)
        try {
            // Untouched text goes back as stored, not in the editor's equivalent spelling.
            const content = text.changed ? text.markdown : initialContent
            const savedNote = note === null
                ? await createNote(createKey, {title: normalizedTitle, content, icon})
                : await updateNote(note.id, {title: normalizedTitle, content, icon, version: note.version})
            notifyNotesChanged()
            release()
            onSaved(savedNote)
        } catch (e) {
            if (e instanceof NoteAlreadyCreatedError) setSavedElsewhere(e.noteId)
            else if (!(e instanceof AuthRequiredError)) setError(saveFailure(e, t, locale))
        } finally {
            savingRef.current = false
            setSaving(false)
        }
    }

    async function rewrite(text?: string) {
        const instruction = (text ?? command).trim()
        const editor = editorRef.current
        if (note === null || instruction === '' || busy || editor === null || rewriteRef.current !== null) return
        const content = editor.getMarkdown()
        setError(null)
        if (instruction.length > AI_EDIT_INSTRUCTION_LIMIT) {
            setRewriteNotice(t.commandTooLong)
            return
        }
        if (content === '') {
            setRewriteNotice(t.writeFirst)
            return
        }
        if (content.length > AI_EDIT_CONTENT_LIMIT) {
            setRewriteNotice(t.tooLong)
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
                if (!changed) setRewriteNotice(t.nothingChanged)
            } else {
                setRewriteNotice(t.rewriteFailed)
            }
        } catch (e) {
            if (isAbortError(e)) {
                if (rewriteRef.current === controller) setRewriteNotice(t.stopped)
            } else if (!(e instanceof AuthRequiredError)) {
                setRewriteNotice(rewriteFailure(e, t))
            }
        } finally {
            if (frame !== null) cancelAnimationFrame(frame)
            if (rewriteRef.current === controller) rewriteRef.current = null
            setPreview(null)
        }
    }

    return <div className="note-edit">
        <div className="note-edit-title">
            <IconPicker label={t.icon} value={icon} onChange={setIcon} disabled={busy} dataSource={EMOJI_DATA_URL}/>
            <div className="note-edit-title-input">
                <TextField label={t.title} value={title} maxLength={TITLE_LIMIT} disabled={busy}
                           onChange={(event) => setTitle(event.target.value)}/>
            </div>
        </div>
        <NoteEditor content={initialContent} onChange={setText} locked={busy} preview={preview}
                    handleRef={editorRef} highlightDateHeadings={note?.source === 'CHAT_SUMMARY'}/>
        <div className="note-edit-dock">
            {rewriteNotice && <p className="note-edit-notice" role="status">{rewriteNotice}</p>}
            {note !== null && <ChatComposer value={command} onChange={setCommand} onSubmit={(text) => void rewrite(text)}
                                            placeholder={t.hint(hint)} disabled={saving}
                                            generationActive={generating} onStop={() => rewriteRef.current?.abort()}/>}
            <div className="note-edit-actions">
                {error && <p className="note-edit-error" role="alert">{error}</p>}
                {savedElsewhere && <p className="note-edit-error" role="alert">
                    {t.alreadySaved} <Link to={`/notes/${encodeURIComponent(savedElsewhere)}`}>{t.openSaved}</Link>
                </p>}
                <Button variant="ghost" disabled={busy}
                        onClick={() => (dirty ? setConfirmingDiscard(true) : onClose())}>{t.cancel}</Button>
                <Button variant="outline" disabled={!canSave} aria-busy={saving}
                        onClick={() => void save()}>{saving ? t.saving : t.save}</Button>
            </div>
        </div>
        {(confirmingDiscard || leaving) &&
            <Dialog title={note === null ? t.discardNewTitle : t.discardTitle}
                    body={note === null ? t.discardNewBody : t.discardBody}
                    confirm={note === null ? t.discardNew : t.discard} cancel={t.keepEditing}
                    onConfirm={() => {
                        setConfirmingDiscard(false)
                        if (leaving) {
                            blocker.proceed?.()
                        } else {
                            release()
                            onClose()
                        }
                    }}
                    onCancel={() => {
                        setConfirmingDiscard(false)
                        if (leaving) blocker.reset?.()
                    }}/>}
    </div>
}
