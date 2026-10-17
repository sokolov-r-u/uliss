import {type ReactNode, useCallback, useEffect, useRef, useState} from 'react'
import {useLocation, useNavigate, useParams} from 'react-router-dom'
import {Button, Icon, IconButton} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {isBackToDeleteDialog} from '../ui/actions/deleteDialogReturn'
import {ItemActions} from '../ui/actions/ItemActions'
import {ContextPanel, PanelFact, PanelSection, PanelToggle, usePanelOpen} from '../ui/ContextPanel'
import {NoteChatsList} from '../ui/links/NoteChatsList'
import {MarkdownContent} from '../ui/MarkdownContent'
import {ScreenHeader} from '../ui/ScreenHeader'
import {getNote, type Note, NoteApiError, notifyNotesChanged, streamNoteStatus} from './noteApi'
import {asEditable, NoteEditForm} from './NoteEditForm'
import './notes.css'
import {formatFullDate} from '../ui/format'

type ReadyNote = Note & { content: string }

/** Status-stream reconnects per load (the service closes a stream after 10 minutes) before offering Retry. */
export const MAX_STATUS_RECONNECTS = 5

type DetailState =
    | { status: 'loading' }
    | { status: 'generating'; note: Note }
    | { status: 'ready'; note: ReadyNote }
    | { status: 'failed'; note: Note }
    | { status: 'not-found' }
    | { status: 'error'; message: string }

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
}

export function NoteDetailView({state, onRetry, actions, edit}: {
    state: DetailState
    onRetry?: () => void
    actions?: ReactNode
    /** The edit form of a ready note; it replaces the note's text while it is open. */
    edit?: ReactNode
}) {
    // The note title is the page heading; every other state names itself in the body.
    const title = state.status === 'ready' ? state.note.title || undefined : undefined
    const [panelOpen, togglePanel, closePanel] = usePanelOpen()
    const navigate = useNavigate()
    const note = 'note' in state ? state.note : null
    const right = <>{note && <PanelToggle label="Note details" open={panelOpen}
                                          onToggle={togglePanel}/>}{actions}</>
    return <div className="detail-layout"><div className="note-detail">
        {title ? <ScreenHeader title={title} right={right}/> : <ScreenHeader kicker="Note" right={right}/>}
        <div className="note-detail-body">
        {state.status === 'loading' && <p className="note-detail-state">Loading…</p>}
        {state.status === 'generating' &&
            <div className="note-detail-state" aria-live="polite"><h1>Writing this note…</h1>
                <p>Generation continues in the background. You can leave and return later.</p></div>}
        {state.status === 'failed' && <div className="note-detail-state note-detail-error"><h1>Summary failed</h1>
            <p>The source chat is unchanged. Request a new summary from the conversation.</p></div>}
        {state.status === 'not-found' && <div className="note-detail-state"><h1>Note not found</h1>
            <p>It may not exist, or it may belong to another account.</p></div>}
        {state.status === 'error' &&
            <div className="note-detail-state note-detail-error"><h1>Could not load the note</h1>
                <p>{state.message}</p>{onRetry && <Button size="sm" variant="quiet" onClick={onRetry}>Retry</Button>}
            </div>}
        {state.status === 'ready' && !edit && state.note.updating &&
            <p className="note-update-notice" role="status">Updating this note…</p>}
        {state.status === 'ready' && edit && <div className="note-content note-content-editing">{edit}</div>}
        {state.status === 'ready' && !edit && <article className="note-content">
            <MarkdownContent content={state.note.content}
                             highlightDateHeadings={state.note.source === 'CHAT_SUMMARY'}/>
        </article>}
        </div>
    </div>
        {note && <ContextPanel label="This note" open={panelOpen} onClose={closePanel}>
            <PanelSection label="Written from">
                <NoteChatsList noteId={note.id} onOpen={(chatId) => navigate(`/chats/${chatId}`)}
                               empty={<p className="context-text">
                                   {note.source === 'CHAT_SUMMARY' ? 'Summary of a chat' : 'Written by hand'}</p>}/>
            </PanelSection>
            <PanelSection label="Dates">
                <PanelFact label="Written" value={formatFullDate(note.createdAt) || '—'}/>
                <PanelFact label="Updated" value={formatFullDate(note.updatedAt ?? note.createdAt) || '—'}/>
            </PanelSection>
        </ContextPanel>}
    </div>
}

export function NoteDetailPage() {
    const {noteId} = useParams<{ noteId: string }>()
    const navigate = useNavigate()
    const backToDeleteDialog = isBackToDeleteDialog(useLocation().state)
    const [state, setState] = useState<DetailState>({status: 'loading'})
    const [editing, setEditing] = useState(false)
    const controllerRef = useRef<AbortController | null>(null)

    const load = useCallback(async () => {
        if (!noteId) return
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        setEditing(false)
        setState({status: 'loading'})
        try {
            let note = await getNote(noteId, controller.signal)
            let settledBeforeStream = true
            for (let reconnects = 0; ; reconnects++) {
                if (note.status === 'READY' && !note.updating) {
                    // A note that finished while the stream was closed: note lists re-read it.
                    if (!settledBeforeStream) notifyNotesChanged()
                    if (note.content == null) {
                        setState({status: 'error', message: 'ready note content is unavailable'})
                        return
                    }
                    setState({status: 'ready', note: {...note, content: note.content}})
                    return
                }
                if (note.status === 'FAILED') {
                    if (!settledBeforeStream) notifyNotesChanged()
                    setState({status: 'failed', note})
                    return
                }
                settledBeforeStream = false
                if (note.status === 'READY') {
                    // An update keeps the current content readable; the stream waits for the appended part.
                    if (note.content == null) {
                        setState({status: 'error', message: 'ready note content is unavailable'})
                        return
                    }
                    setState({status: 'ready', note: {...note, content: note.content}})
                } else {
                    setState({status: 'generating', note})
                }
                const generatingNote = note
                const terminal = await streamNoteStatus(noteId, {
                    signal: controller.signal,
                    onStatus: (event) => {
                        if (event.status === 'FAILED') {
                            setState({status: 'failed', note: {...generatingNote, status: 'FAILED'}})
                        }
                    },
                })
                if (terminal) {
                    // The note finished (title and content now exist, or it failed): note lists re-read it.
                    notifyNotesChanged()
                    if (terminal === 'READY') {
                        const ready = await getNote(noteId, controller.signal)
                        // Another update started meanwhile: keep watching it.
                        if (ready.status === 'READY' && ready.updating) {
                            note = ready
                            continue
                        }
                        if (ready.status !== 'READY' || ready.content == null) {
                            setState({status: 'error', message: 'ready note content is unavailable'})
                            return
                        }
                        setState({status: 'ready', note: {...ready, content: ready.content}})
                    }
                    return
                }
                // The service closes a status stream after a fixed time (proxies may cut it too): reconnect while
                // the note is still generating, but not forever if every stream ends at once.
                if (controller.signal.aborted) return
                if (reconnects === MAX_STATUS_RECONNECTS) {
                    // An updating note stays readable under its notice; only a note still being written fails here.
                    if (note.status === 'READY') return
                    setState({status: 'error', message: 'The note is still being written. Check back later.'})
                    return
                }
                note = await getNote(noteId, controller.signal)
            }
        } catch (error) {
            if (controller.signal.aborted || error instanceof AuthRequiredError || isAbortError(error)) return
            if (error instanceof NoteApiError && error.kind === 'http' && error.status === 404) {
                setState({status: 'not-found'})
            } else {
                setState({status: 'error', message: error instanceof Error ? error.message : String(error)})
            }
        }
    }, [noteId])

    useEffect(() => {
        void load()
        return () => controllerRef.current?.abort()
    }, [load])

    const note = 'note' in state ? state.note : null
    const noteTitle = note?.title ?? 'Untitled note'
    const editable = state.status === 'ready' ? asEditable(state.note) : null
    const edit = editing && editable
        ? <NoteEditForm note={editable}
                        onSaved={(saved) => {
                            setEditing(false)
                            setState({status: 'ready', note: {...saved, content: saved.content ?? editable.content}})
                        }}
                        onClose={() => setEditing(false)}/>
        : undefined
    const editButton = state.status === 'ready' &&
        <IconButton s={44} title="Edit note" disabled={editable === null || state.note.updating === true}
                    onClick={() => setEditing(true)}>
            <Icon name="edit" size={17}/>
        </IconButton>
    const actions = note && <ItemActions
        target={{kind: 'note', id: note.id, title: noteTitle, renamable: note.status === 'READY'}}
        onRenamed={(title, renamed) => setState((current) => 'note' in current
            ? {...current, note: {...current.note, title, version: renamed?.version ?? current.note.version}} as DetailState
            : current)}
        // Deleted from the chat delete dialog's list: go back to that dialog, which no longer lists it.
        onDeleted={() => backToDeleteDialog ? navigate(-1) : navigate('/notes', {replace: true})}>
        {(openMenu) => <IconButton s={44} title={`Actions for ${noteTitle}`}
                                   onClick={(event) => openMenu(event.currentTarget)}>
            <Icon name="dots" size={17}/>
        </IconButton>}
    </ItemActions>

    // Opened from the chat delete dialog: the previous history entry is that screen with the dialog open.
    const backButton = backToDeleteDialog && <Button variant="quiet" size="sm" onClick={() => navigate(-1)}>Back</Button>

    return <NoteDetailView state={state} onRetry={() => void load()} edit={edit}
                           actions={edit ? undefined : <>{backButton}{editButton}{actions}</>}/>
}
