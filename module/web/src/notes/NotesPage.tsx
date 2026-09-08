import {useState} from 'react'
import {Dialog, EmptyState, Icon, Kicker, ListHeader, ListRow, Notice, TextField} from '@uliss/design-system'
import {useNavigate} from 'react-router-dom'
import type {NoteViewModel} from '../views/models'
import {NoticeOverlay} from '../ui/notice/NoticeOverlay'

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
                                 date={note.date} unread={note.unread} dim={!note.unread}
                                 meta={note.linkCount > 0 ? <><Icon name="star"
                                                                    size={12}/>{note.linkCount}</> : undefined}
                                 onClick={onOpen ? () => onOpen(note) : undefined}
                                 onMenu={() => setMenuId(note.id)} menuLabel={`Actions for ${note.title}`}/>
                    </div>
                ))}
            </div>
            {menuNote && <div className="row-menu-layer">
                <button className="row-menu-backdrop" type="button" aria-label="Close note actions"
                        onClick={() => setMenuId(null)}/>
                <div className="row-menu" role="menu" aria-label={`Actions for ${menuNote.title}`}>
                    <div className="row-menu-title">{menuNote.title}</div>
                    <button type="button" role="menuitem" onClick={() => {
                        setTitle(menuNote.title);
                        setRenaming(menuNote);
                        setMenuId(null)
                    }}>Rename
                    </button>
                    <button type="button" role="menuitem" className="danger" onClick={() => {
                        setDeleting(menuNote);
                        setMenuId(null)
                    }}>Delete
                    </button>
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

/** Production adapter: note-service has no notes-list contract, so runtime stays honestly empty. */
export function NotesPage() {
    const navigate = useNavigate()
    return <NotesView notes={[]} onStartChat={() => navigate('/chats')}/>
}
