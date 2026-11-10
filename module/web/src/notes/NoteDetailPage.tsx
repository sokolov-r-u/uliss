import {type ReactNode, useCallback, useEffect, useRef, useState} from 'react'
import {useLocation, useNavigate, useParams} from 'react-router-dom'
import {describeError} from '../lib/apiHelpers'
import {Button, Icon, IconButton, noteTitleText, useLocale, useMessages} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {isBackToDeleteDialog} from '../ui/actions/deleteDialogReturn'
import {ItemActions} from '../ui/actions/ItemActions'
import {ContextPanel, PanelToggle, usePanelOpen} from '../ui/ContextPanel'
import {MarkdownContent} from '../ui/MarkdownContent'
import {ScreenHeader} from '../ui/ScreenHeader'
import {listNoteChats, subscribeToChatListChanges} from '../chat/chatApi'
import {useFeatureFlag} from '../lib/featureFlags'
import {useLinkedItems} from '../ui/links/useLinkedItems'
import {getNote, type Note, NoteApiError, type NotePoster, notifyNotesChanged, streamNoteStatus, withPoster} from './noteApi'
import {NoteDetailsSections} from './NoteDetailsSections'
import {asEditable, NoteEditForm} from './NoteEditForm'
import {ResummarizeDialog} from './ResummarizeDialog'
import './notes.css'
import {commonMessages} from '../i18n/common.messages'
import {noteDetailMessages} from './noteDetail.messages'

type ReadyNote = Note & { content: string }

const CHAT_SUBSCRIPTIONS = [subscribeToChatListChanges]

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

export function NoteDetailView({state, onRetry, actions, edit, back = true, onPosterChanged = () => {}}: {
    state: DetailState
    onRetry?: () => void
    actions?: ReactNode
    /** The header's way back to the previous screen; off where the screen offers its own Back. */
    back?: boolean
    /** The edit form of a ready note; it replaces the note's text while it is open. */
    edit?: ReactNode
    /** The note's poster was stored or removed in its details panel. */
    onPosterChanged?: (poster: NotePoster | undefined) => void
}) {
    // The note title is the page heading (a generating note has one when the user named it); other states name
    // themselves in the body.
    const title = state.status === 'ready' || state.status === 'generating'
        ? (state.note.title ? noteTitleText(state.note.title, state.note.icon) : undefined)
        : undefined
    const t = useMessages(noteDetailMessages)
    const common = useMessages(commonMessages)
    const [panelOpen, togglePanel, closePanel] = usePanelOpen()
    const navigate = useNavigate()
    const note = 'note' in state ? state.note : null
    const right = <>{note && <PanelToggle label={t.noteDetails} open={panelOpen}
                                          onToggle={togglePanel}/>}{actions}</>
    return <div className="detail-layout"><div className="note-detail">
        {title ? <ScreenHeader back={back} title={title} right={right}/> : <ScreenHeader back={back} kicker={t.note} right={right}/>}
        <div className="note-detail-body">
        {state.status === 'loading' && <p className="note-detail-state">{common.loading}</p>}
        {state.status === 'generating' &&
            <div className="note-detail-state" aria-live="polite"><h1>{t.writing}</h1>
                <p>{t.writingBody}</p></div>}
        {state.status === 'failed' && <div className="note-detail-state note-detail-error"><h1>{t.summaryFailed}</h1>
            <p>{t.summaryFailedBody}</p></div>}
        {state.status === 'not-found' && <div className="note-detail-state"><h1>{t.notFound}</h1>
            <p>{t.notFoundBody}</p></div>}
        {state.status === 'error' &&
            <div className="note-detail-state note-detail-error"><h1>{t.couldNotLoad}</h1>
                <p>{state.message}</p>{onRetry && <Button size="sm" variant="quiet" onClick={onRetry}>{common.retry}</Button>}
            </div>}
        {state.status === 'ready' && !edit && state.note.updating &&
            <p className="note-update-notice" role="status">{t.updating}</p>}
        {state.status === 'ready' && edit && <div className="note-content note-content-editing">{edit}</div>}
        {state.status === 'ready' && !edit && <article className="note-content">
            <MarkdownContent content={state.note.content}
                             highlightDateHeadings={state.note.source === 'CHAT_SUMMARY'}/>
        </article>}
        </div>
    </div>
        {note && <ContextPanel label={t.thisNote} open={panelOpen} onClose={closePanel}>
            <NoteDetailsSections note={note} onOpenNote={(noteId) => navigate(`/notes/${noteId}`)}
                                 onOpenChat={(chatId) => navigate(`/chats/${chatId}`)}
                                 onPosterChanged={onPosterChanged}/>
        </ContextPanel>}
    </div>
}

export function NoteDetailPage() {
    const {noteId} = useParams<{ noteId: string }>()
    const navigate = useNavigate()
    const backToDeleteDialog = isBackToDeleteDialog(useLocation().state)
    const locale = useLocale()
    // the loader words its failures in the language of the moment without reloading on a switch
    const localeRef = useRef(locale)
    localeRef.current = locale
    const t = useMessages(noteDetailMessages)
    const common = useMessages(commonMessages)
    const [state, setState] = useState<DetailState>({status: 'loading'})
    const [editing, setEditing] = useState(false)
    const [resummarizing, setResummarizing] = useState(false)
    const resummarizeOn = useFeatureFlag('note-resummarize')
    const summaryNote = state.status === 'ready' && state.note.source === 'CHAT_SUMMARY'
    // the chats the note was written from, as its details panel lists them: "Summarize again" needs one
    const {items: noteChats} = useLinkedItems(resummarizeOn && summaryNote ? noteId ?? '' : '', listNoteChats,
        CHAT_SUBSCRIPTIONS)
    const controllerRef = useRef<AbortController | null>(null)

    /** [keepShown] follows a note already on screen (a queued rewrite) without the Loading state in between. */
    const load = useCallback(async (keepShown = false) => {
        if (!noteId) return
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        setEditing(false)
        if (!keepShown) setState({status: 'loading'})
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
                    setState({status: 'error', message: noteDetailMessages[localeRef.current].stillWriting})
                    return
                }
                note = await getNote(noteId, controller.signal)
            }
        } catch (error) {
            if (controller.signal.aborted || error instanceof AuthRequiredError || isAbortError(error)) return
            if (error instanceof NoteApiError && error.kind === 'http' && error.status === 404) {
                setState({status: 'not-found'})
            } else {
                setState({status: 'error', message: describeError(error, localeRef.current)})
            }
        }
    }, [noteId])

    useEffect(() => {
        void load()
        return () => controllerRef.current?.abort()
    }, [load])

    // the poster is stored apart from the text: an open edit keeps its draft and version
    const posterChanged = useCallback((poster: NotePoster | undefined) => setState((shown) => 'note' in shown
        ? {...shown, note: withPoster(shown.note, poster)} as DetailState
        : shown), [])

    const note = 'note' in state ? state.note : null
    const noteTitle = note?.title ?? common.untitledNote
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
        <IconButton s={44} title={t.edit} disabled={editable === null || state.note.updating === true}
                    onClick={() => setEditing(true)}>
            <Icon name="edit" size={17}/>
        </IconButton>
    const canResummarize = resummarizeOn && summaryNote && noteChats.length > 0
    const resummarizeAction = canResummarize
        ? [{label: t.summarizeAgain, disabled: state.note.updating === true, onSelect: () => setResummarizing(true)}]
        : []
    const actions = note && <ItemActions
        target={{kind: 'note', id: note.id, title: noteTitle, icon: note.icon, renamable: note.status === 'READY'}}
        extraActions={resummarizeAction}
        onRenamed={(title, renamed) => setState((current) => 'note' in current
            ? {...current, note: {...current.note, title, version: renamed?.version ?? current.note.version}} as DetailState
            : current)}
        // Deleted from the chat delete dialog's list: go back to that dialog, which no longer lists it.
        onDeleted={() => backToDeleteDialog ? navigate(-1) : navigate('/notes', {replace: true})}>
        {(openMenu) => <IconButton s={44} title={common.actionsFor(noteTitleText(noteTitle, note.icon))}
                                   onClick={(event) => openMenu(event.currentTarget)}>
            <Icon name="dots" size={17}/>
        </IconButton>}
    </ItemActions>

    // Opened from the chat delete dialog: the previous history entry is that screen with the dialog open.
    const backButton = backToDeleteDialog && <Button variant="quiet" size="sm" onClick={() => navigate(-1)}>{common.back}</Button>

    return <>
        <NoteDetailView state={state} onRetry={() => void load()} edit={edit} back={!backToDeleteDialog}
                        onPosterChanged={posterChanged}
                        actions={edit ? undefined : <>{backButton}{editButton}{actions}</>}/>
        {resummarizing && note && <ResummarizeDialog noteId={note.id} onClose={() => setResummarizing(false)}
                                                     onQueued={(queued) => {
                                                         setResummarizing(false)
                                                         // updating at once: the menu item greys before the re-read
                                                         setState((current) => current.status === 'ready'
                                                             ? {...current, note: {...current.note, updating: queued.updating === true}}
                                                             : current)
                                                         // the old text stays under "Updating this note…" until the new one arrives
                                                         void load(true)
                                                     }}/>}
    </>
}
