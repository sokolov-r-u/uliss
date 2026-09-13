import {useCallback, useEffect, useRef, useState} from 'react'
import {Link, useParams} from 'react-router-dom'
import {Button, Kicker} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {getNote, type Note, NoteApiError, streamNoteStatus} from './noteApi'
import './notes.css'

type DetailState =
    | { status: 'loading' }
    | { status: 'generating'; note: Note }
    | { status: 'ready'; note: Note }
    | { status: 'failed'; note: Note }
    | { status: 'not-found' }
    | { status: 'error'; message: string }

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
}

export function NoteDetailView({state, onRetry}: { state: DetailState; onRetry?: () => void }) {
    return <div className="note-detail">
        <header className="note-detail-header"><Link to="/notes" className="note-back-link">‹ notes</Link>
            <Kicker size={9} spacing="3px" color="var(--text-faint)">Note</Kicker></header>
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
        {state.status === 'ready' && <article className="note-content">{state.note.content}</article>}
    </div>
}

export function NoteDetailPage() {
    const {noteId} = useParams<{ noteId: string }>()
    const [state, setState] = useState<DetailState>({status: 'loading'})
    const controllerRef = useRef<AbortController | null>(null)

    const load = useCallback(async () => {
        if (!noteId) return
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        setState({status: 'loading'})
        try {
            const note = await getNote(noteId, controller.signal)
            if (note.status === 'READY') {
                if (note.content == null) throw new NoteApiError('protocol', 'ready note content is unavailable')
                setState({status: 'ready', note})
                return
            }
            if (note.status === 'FAILED') {
                setState({status: 'failed', note})
                return
            }
            setState({status: 'generating', note})
            const terminal = await streamNoteStatus(noteId, {
                signal: controller.signal,
                onStatus: (event) => {
                    if (event.status === 'FAILED') setState({status: 'failed', note: {...note, status: 'FAILED'}})
                },
            })
            if (terminal === 'READY') {
                const ready = await getNote(noteId, controller.signal)
                if (ready.status !== 'READY' || ready.content == null) {
                    throw new NoteApiError('protocol', 'ready note content is unavailable')
                }
                setState({status: 'ready', note: ready})
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

    return <NoteDetailView state={state} onRetry={() => void load()}/>
}
