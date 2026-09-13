import {useEffect, useState} from 'react'
import {Button, Dialog, EmptyState, Icon, Kicker, ListHeader, ListRow, Notice, TextField} from '@uliss/design-system'
import {useNavigate} from 'react-router-dom'
import {AuthRequiredError} from '../auth/apiClient'
import type {NoteViewModel} from '../views/models'
import {NoticeOverlay} from '../ui/notice/NoticeOverlay'
import {listNotes, type Note} from './noteApi'
import './notes.css'

export interface NotesViewProps {
    notes: NoteViewModel[]
    onOpen?: (note: NoteViewModel) => void
    onRename?: (note: NoteViewModel, title: string) => void
    onDelete?: (note: NoteViewModel) => void
    onStartChat?: () => void
    initialMenuId?: string
}

export function NotesView({notes, onOpen, onRename, onDelete, onStartChat, initialMenuId}: NotesViewProps) {
    const [menuId, setMenuId] = useState<string | null>(initialMenuId ?? null)
    const [renaming, setRenaming] = useState<NoteViewModel | null>(null)
    const [deleting, setDeleting] = useState<NoteViewModel | null>(null)
    const [title, setTitle] = useState('')
    const unread = notes.filter((note) => note.unread).length
    const maxOrdinal = notes.reduce((max, note) => Math.max(max, note.ordinal), 0)
    const menuNote = notes.find((note) => note.id === menuId)
    const hasActions = Boolean(onRename || onDelete)

    if (notes.length === 0) {
        return <div className="product-view product-empty"><EmptyState title="Nothing written down yet"
                                                                       body="Talk to Uliss for a while. When a thought is worth keeping, it writes the note for you — you never have to."
                                                                       action="Start a chat" onAction={onStartChat}/>
        </div>
    }

    return (
        <div className="product-view">
            <ListHeader kicker="Notes" total={String(maxOrdinal).padStart(3, '0')}
                        right={unread > 0 ? <Kicker size={9} spacing="2px"
                                                    color="var(--text-faint)">{unread} new</Kicker> : undefined}/>
            <div className="product-list">
                {notes.map((note) => (
                    <div key={note.id} className={menuId === note.id ? 'product-row-active' : undefined}>
                        <ListRow title={`${String(note.ordinal).padStart(3, '0')} · ${note.title}`}
                                 date={note.date} unread={note.unread} dim={note.unread === false}
                                 meta={note.linkCount > 0 ? <><Icon name="star"
                                                                    size={12}/>{note.linkCount}</> : undefined}
                                 onClick={onOpen ? () => onOpen(note) : undefined}
                                 dots={hasActions}
                                 onMenu={hasActions ? () => setMenuId(note.id) : undefined}
                                 menuLabel={`Actions for ${note.title}`}/>
                    </div>
                ))}
            </div>
            {menuNote && <div className="row-menu-layer">
                <button className="row-menu-backdrop" type="button" aria-label="Close note actions"
                        onClick={() => setMenuId(null)}/>
                <div className="row-menu" role="menu" aria-label={`Actions for ${menuNote.title}`}>
                    <div className="row-menu-title">{menuNote.title}</div>
                    {onRename && <button type="button" role="menuitem" onClick={() => {
                        setTitle(menuNote.title);
                        setRenaming(menuNote);
                        setMenuId(null)
                    }}>Rename
                    </button>}
                    {onDelete && <button type="button" role="menuitem" className="danger" onClick={() => {
                        setDeleting(menuNote);
                        setMenuId(null)
                    }}>Delete
                    </button>}
                </div>
            </div>}
            {renaming && <NoticeOverlay onBackdropClick={() => setRenaming(null)}>
                <Notice title={`Rename “${renaming.title}”`} primary="Rename" secondary="Cancel"
                        primaryDisabled={title.trim() === ''} onSecondary={() => setRenaming(null)}
                        onPrimary={() => {
                            onRename?.(renaming, title.trim());
                            setRenaming(null)
                        }}>
                    <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)}
                               maxLength={80} autoFocus/>
                </Notice>
            </NoticeOverlay>}
            {deleting && (
                <Dialog danger title={`Delete “${deleting.title}”?`}
                        body="The note goes. The chats it came from stay, and so do its constellations."
                        confirm="Delete" cancel="Keep" onCancel={() => setDeleting(null)}
                        onConfirm={() => {
                            onDelete?.(deleting);
                            setDeleting(null)
                        }}/>
            )}
        </div>
    )
}

function formatDate(iso?: string): string {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
}

function contentParts(content: string | null): { title: string; excerpt: string } {
    const lines = content?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? []
    const normalized = lines.join(' ').replace(/\s+/g, ' ').trim()
    const first = lines[0]?.replace(/\s+/g, ' ').trim() ?? 'Ready note'
    const title = first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first
    const excerpt = normalized.startsWith(first) ? normalized.slice(first.length).trim() : normalized
    return {title, excerpt}
}

export function toNoteViewModels(notes: Note[]): NoteViewModel[] {
    return notes.map((note, index) => {
        const content = contentParts(note.content)
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
                      onStartChat={() => navigate('/chats')}/>
}
