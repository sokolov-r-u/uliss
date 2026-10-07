import {useEffect, useState} from 'react'
import {Button, EmptyState, Icon, Kicker, ListHeader, ListRow} from '@uliss/design-system'
import {useNavigate} from 'react-router-dom'
import {AuthRequiredError} from '../auth/apiClient'
import type {NoteViewModel} from '../views/models'
import {ItemActions} from '../ui/actions/ItemActions'
import {listNotes, type Note} from './noteApi'
import './notes.css'

export interface NotesViewProps {
    notes: NoteViewModel[]
    onOpen?: (note: NoteViewModel) => void
    onStartChat?: () => void
    /** Enables Rename · Delete; omitted for fixture-only renders. */
    actions?: { onRenamed: (id: string, title: string) => void; onDeleted: (id: string) => void }
    /** Fixture-only: render with this row's menu open. */
    initialMenuId?: string
}

export function NotesView({notes, onOpen, onStartChat, actions, initialMenuId}: NotesViewProps) {
    const unread = notes.filter((note) => note.unread).length
    const maxOrdinal = notes.reduce((max, note) => Math.max(max, note.ordinal), 0)

    if (notes.length === 0) {
        return <div className="product-view product-empty"><EmptyState title="Nothing written down yet"
                                                                       body="Talk to Uliss for a while. When a thought is worth keeping, it writes the note for you — you never have to."
                                                                       action="Start a chat" onAction={onStartChat}/>
        </div>
    }

    const row = (note: NoteViewModel, openMenu?: (anchor: HTMLElement) => void) =>
        <ListRow title={`${String(note.ordinal).padStart(3, '0')} · ${note.title}`}
                 date={note.date} unread={note.unread} dim={note.unread === false}
                 meta={note.linkCount > 0 ? <><Icon name="star" size={12}/>{note.linkCount}</> : undefined}
                 onClick={onOpen ? () => onOpen(note) : undefined}
                 dots={openMenu !== undefined} onMenu={openMenu}
                 menuLabel={`Actions for ${note.title}`}/>

    return (
        <div className="product-view">
            <ListHeader kicker="Notes" total={String(maxOrdinal).padStart(3, '0')}
                        right={unread > 0 ? <Kicker size={9} spacing="2px"
                                                    color="var(--text-faint)">{unread} new</Kicker> : undefined}/>
            <div className="product-list">
                {notes.map((note) => actions
                    ? <ItemActions key={note.id}
                                   target={{
                                       kind: 'note',
                                       id: note.id,
                                       title: note.title,
                                       renamable: note.renamable ?? false
                                   }}
                                   initialOpen={note.id === initialMenuId}
                                   onRenamed={(title) => actions.onRenamed(note.id, title)}
                                   onDeleted={() => actions.onDeleted(note.id)}>
                        {(openMenu, menuOpen) => <div className={menuOpen ? 'product-row-active' : undefined}>
                            {row(note, openMenu)}
                        </div>}
                    </ItemActions>
                    : <div key={note.id}>{row(note)}</div>)}
            </div>
        </div>
    )
}

function formatDate(iso?: string): string {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
}

function contentParts(content: string | null, storedTitle?: string): { title: string; excerpt: string } {
    const lines = content?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? []
    const normalized = lines.join(' ').replace(/\s+/g, ' ').trim()
    if (storedTitle) return {title: storedTitle, excerpt: normalized}
    // Notes created before stored titles fall back to their first content line.
    const first = lines[0]?.replace(/\s+/g, ' ').trim() ?? 'Ready note'
    const title = first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first
    const excerpt = normalized.startsWith(first) ? normalized.slice(first.length).trim() : normalized
    return {title, excerpt}
}

export function toNoteViewModels(notes: Note[]): NoteViewModel[] {
    return notes.map((note, index) => {
        const content = contentParts(note.content, note.title)
        const title = note.status === 'GENERATING'
            ? 'Generating note…'
            : note.status === 'FAILED' ? 'Summary failed' : content.title
        return {
            id: note.id,
            ordinal: notes.length - index,
            title,
            excerpt: note.status === 'READY' ? content.excerpt : '',
            date: formatDate(note.createdAt),
            linkCount: 0,
            renamable: note.status === 'READY',
        }
    })
}

export function NotesPage() {
    const navigate = useNavigate()
    const [state, setState] = useState<
        { status: 'loading' } | { status: 'ready'; notes: NoteViewModel[] } | { status: 'error'; message: string }
    >({status: 'loading'})
    const [revision, setRevision] = useState(0)

    useEffect(() => {
        const controller = new AbortController()
        setState({status: 'loading'})
        listNotes(controller.signal)
            .then((notes) => setState({status: 'ready', notes: toNoteViewModels(notes)}))
            .catch((error: unknown) => {
                if (controller.signal.aborted || error instanceof AuthRequiredError) return
                setState({status: 'error', message: error instanceof Error ? error.message : String(error)})
            })
        return () => controller.abort()
    }, [revision])

    if (state.status === 'loading') {
        return <div className="product-view"><ListHeader kicker="Notes"/><p className="notes-state">Loading…</p></div>
    }
    if (state.status === 'error') {
        return <div className="product-view"><ListHeader kicker="Notes"/>
            <div className="notes-state notes-state-error">
                <p>{state.message}</p><Button size="sm" variant="quiet"
                                              onClick={() => setRevision((value) => value + 1)}>Retry</Button>
            </div>
        </div>
    }
    return <NotesView notes={state.notes} onOpen={(note) => navigate(`/notes/${note.id}`)}
                      onStartChat={() => navigate('/chats')}
                      actions={{
                          onRenamed: (id, title) => setState((current) => current.status === 'ready'
                              ? {
                                  status: 'ready',
                                  notes: current.notes.map((note) => note.id === id ? {...note, title} : note)
                              }
                              : current),
                          onDeleted: (id) => setState((current) => current.status === 'ready'
                              ? {status: 'ready', notes: current.notes.filter((note) => note.id !== id)}
                              : current),
                      }}/>
}
