import {type ReactNode, useEffect, useState} from 'react'
import {Button, EmptyState, Icon, Kicker, ListRow, noteTitleText} from '@uliss/design-system'
import {describeError} from '../lib/apiHelpers'
import {useNavigate} from 'react-router-dom'
import type {NoteViewModel} from '../views/models'
import {ItemActions} from '../ui/actions/ItemActions'
import {groupByMonth} from '../ui/nav/recency'
import {ScreenHeader} from '../ui/ScreenHeader'
import {ListMore} from '../ui/list/ListMore'
import {useKeysetList} from '../ui/list/useKeysetList'
import {listNotes, type Note, noteChangedAt, subscribeToNotesChanges} from './noteApi'
import {pinnedNotes as pinnedNotesStore, usePinnedNotes, withoutPinned} from '../ui/pins/pinned'
import {PinnedFailed} from '../ui/pins/PinnedFailed'
import './notes.css'
import {formatShortDate} from '../ui/format'

export interface NotesViewProps {
    notes: NoteViewModel[]
    onOpen?: (note: NoteViewModel) => void
    onStartChat?: () => void
    /** Enables Rename · Delete; omitted for fixture-only renders. */
    actions?: { onRenamed: (id: string, title: string) => void; onDeleted: (id: string) => void }
    /** Fixture-only: render with this row's menu open. */
    initialMenuId?: string
    /** All the user's notes, when only a page of them is shown; the header counts [notes] without it. */
    total?: number
    /** Rendered after the rows, e.g. the next-page loader. */
    footer?: ReactNode
    /** The pinned notes, shown above the months under their own label; [notes] leaves them out. */
    pinned?: NoteViewModel[]
    /** Said above the rows (e.g. that the pinned notes did not load); the list is not called empty while it is set. */
    notice?: ReactNode
}

export function NotesView({notes, onOpen, onStartChat, actions, initialMenuId, total, footer, pinned = [], notice}:
                              NotesViewProps) {
    const unread = [...pinned, ...notes].filter((note) => note.unread).length

    if (notes.length === 0 && pinned.length === 0 && !notice) {
        return <div className="product-view"><ScreenHeader kicker="Notes" count={0}/>
            <div className="product-body"><div className="product-empty">
                <EmptyState title="Nothing written down yet"
                            body="Talk to Uliss for a while. When a thought is worth keeping, it writes the note for you — you never have to."
                            action="Start a chat" onAction={onStartChat}/>
            </div></div>
        </div>
    }

    const row = (note: NoteViewModel, first: boolean, openMenu?: (anchor: HTMLElement) => void) =>
        <ListRow title={note.title} icon={note.icon ?? null} first={first}
                 date={note.date} unread={note.unread} dim={note.unread === false}
                 meta={note.linkCount > 0 ? <><Icon name="star" size={12}/>{note.linkCount}</> : undefined}
                 onClick={onOpen ? () => onOpen(note) : undefined}
                 dots={openMenu !== undefined} onMenu={openMenu}
                 menuLabel={`Actions for ${noteTitleText(note.title, note.icon)}`}/>

    return (
        <div className="product-view">
            <ScreenHeader kicker="Notes" count={total ?? pinned.length + notes.length}
                          right={unread > 0 ? <Kicker size={9} spacing="2px"
                                                      color="var(--text-faint)">{unread} new</Kicker> : undefined}/>
            <div className="product-body"><div className="product-list">
                {notice}
                {[
                    ...(pinned.length > 0 ? [{label: 'Pinned', items: pinned}] : []),
                    ...groupByMonth(notes, (note) => note.listedAt),
                ].map((group, groupIndex) => <div
                    key={`${group.label}-${groupIndex}`} className="list-group">
                    {group.label && <div className="list-month"><Kicker size={8.5} spacing="3px"
                                                                        color="var(--text-faint)">{group.label}</Kicker></div>}
                {group.items.map((note, index) => actions
                    ? <ItemActions key={note.id}
                                   target={{
                                       kind: 'note',
                                       id: note.id,
                                       title: note.title,
                                       icon: note.icon,
                                       renamable: note.renamable ?? false
                                   }}
                                   initialOpen={note.id === initialMenuId}
                                   onRenamed={(title) => actions.onRenamed(note.id, title)}
                                   onDeleted={() => actions.onDeleted(note.id)}>
                        {(openMenu, menuOpen) => <div className={menuOpen ? 'product-row-active' : undefined}>
                            {row(note, index === 0, openMenu)}
                        </div>}
                    </ItemActions>
                    : <div key={note.id}>{row(note, index === 0)}</div>)}
                </div>)}
                {footer}
            </div></div>
        </div>
    )
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

/** Row models; [listedAt] picks the time a row shows and is grouped by (creation unless the list orders otherwise). */
export function toNoteViewModels(notes: Note[], listedAt: (note: Note) => string | undefined = (note) => note.createdAt):
    NoteViewModel[] {
    return notes.map((note, index) => {
        const content = contentParts(note.content, note.title)
        // a name the user gave a summary is shown while the note is still being written
        const title = note.status === 'GENERATING'
            ? note.title || 'Generating note…'
            : note.status === 'FAILED' ? 'Summary failed' : content.title
        return {
            id: note.id,
            ordinal: notes.length - index,
            title,
            icon: note.icon ?? null,
            excerpt: note.status === 'READY' ? content.excerpt
                : note.status === 'GENERATING' && note.title ? 'Generating note…' : '',
            date: formatShortDate(listedAt(note)),
            linkCount: 0,
            renamable: note.status === 'READY',
            listedAt: listedAt(note),
        }
    })
}

export function NotesPage() {
    const navigate = useNavigate()
    const [revision, setRevision] = useState(0)
    const {state, loadMore, update} = useKeysetList(listNotes, revision)
    const pinned = usePinnedNotes()

    useEffect(() => subscribeToNotesChanges(() => setRevision((value) => value + 1)), [])

    const pinnedNotes = pinned.status === 'ready' ? pinned.items : []
    // a pinned note lives only in the Pinned group, also while a page fetched before the pin is still shown
    const items = state.status === 'ready' ? withoutPinned(state.items, pinnedNotes) : []
    // "Nothing written down yet" waits for the pinned list: every note may be pinned
    if (state.status === 'loading' || (state.status === 'ready' && pinned.status === 'loading' && items.length === 0)) {
        return <div className="product-view"><ScreenHeader kicker="Notes"/><p className="notes-state">Loading…</p></div>
    }
    if (state.status === 'error') {
        return <div className="product-view"><ScreenHeader kicker="Notes"/>
            <div className="notes-state notes-state-error">
                <p>{describeError(state.error)}</p><Button size="sm" variant="quiet"
                                                           onClick={() => setRevision((value) => value + 1)}>Retry</Button>
            </div>
        </div>
    }
    return <NotesView notes={toNoteViewModels(items, noteChangedAt)} total={state.total}
                      pinned={toNoteViewModels(pinnedNotes, noteChangedAt)}
                      notice={pinned.status === 'error' ? <PinnedFailed onRetry={pinnedNotesStore.refresh}/> : undefined}
                      onOpen={(note) => navigate(`/notes/${note.id}`)}
                      onStartChat={() => navigate('/chats')}
                      footer={<ListMore hasMore={state.hasMore} state={state.more} onMore={loadMore}/>}
                      actions={{
                          onRenamed: (id, title) => update((current) => ({
                              ...current,
                              items: current.items.map((note) => note.id === id ? {...note, title} : note),
                          })),
                          onDeleted: (id) => update((current) => ({
                              ...current,
                              items: current.items.filter((note) => note.id !== id),
                              total: current.total === undefined ? undefined : Math.max(0, current.total - 1),
                          })),
                      }}/>
}
