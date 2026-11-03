import {type ReactNode, useEffect, useMemo, useState} from 'react'
import {
    Button,
    ConstellationChip,
    ConstellationPicker,
    constellationColor,
    EmptyState,
    Icon,
    IconButton,
    Kicker,
    ListRow,
    noteTitleText,
} from '@uliss/design-system'
import {describeError} from '../lib/apiHelpers'
import {useNavigate, useSearchParams} from 'react-router-dom'
import {listConstellations} from '../constellations/constellationApi'
import {buildConstellationTree, type ConstellationTree, pickerItems} from '../constellations/constellationTree'
import {addToFilter, FILTER_LIMIT, FILTER_PARAM, knownFilter, readFilter, withFilter} from './notesFilter'
import type {NoteViewModel} from '../views/models'
import {ItemActions} from '../ui/actions/ItemActions'
import {groupByMonth} from '../ui/nav/recency'
import {ScreenHeader} from '../ui/ScreenHeader'
import {ListMore} from '../ui/list/ListMore'
import {useKeysetList} from '../ui/list/useKeysetList'
import {listNotes, type Note, noteChangedAt, subscribeToNotesChanges} from './noteApi'
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
    /** The constellation filter: its header button, its bar under the header, and its open picker. */
    filter?: NotesFilterSlots
}

export interface NotesFilterSlots {
    button?: ReactNode
    /** Shown under the header while the filter is not empty. */
    bar?: ReactNode
    picker?: ReactNode
    /** The header count while filtered, e.g. "12 of 340". */
    count?: string
    /** Set while the filter is not empty: an empty list then says so and offers to clear it. */
    onClear?: () => void
}

export function NotesView({notes, onOpen, onStartChat, actions, initialMenuId, total, footer, filter}: NotesViewProps) {
    const unread = notes.filter((note) => note.unread).length
    const filtered = filter?.onClear !== undefined
    const count = (filtered ? filter?.count : undefined) ?? total ?? notes.length
    const header = (right?: ReactNode) => <ScreenHeader kicker="Notes" count={count}
                                                        right={right || filter?.button ? <span className="notes-head-actions">
                                                            {right}{filter?.button}
                                                        </span> : undefined}/>

    if (notes.length === 0) {
        return <div className="product-view">{header()}
            {filter?.bar}
            <div className="product-body"><div className="product-empty">
                {filtered
                    ? <EmptyState title="No notes in these constellations"
                                  body="Notes placed here, in their sub-constellations or under their notes will show up in this list."
                                  action="Clear filter" onAction={filter?.onClear}/>
                    : <EmptyState title="Nothing written down yet"
                                  body="Talk to Uliss for a while. When a thought is worth keeping, it writes the note for you — you never have to."
                                  action="Start a chat" onAction={onStartChat}/>}
            </div></div>
            {filter?.picker}
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
            {header(unread > 0 ? <Kicker size={9} spacing="2px" color="var(--text-faint)">{unread} new</Kicker> : undefined)}
            {filter?.bar}
            <div className="product-body"><div className="product-list">
                {groupByMonth(notes, (note) => note.listedAt).map((group, groupIndex) => <div
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
            {filter?.picker}
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
    const [params, setParams] = useSearchParams()
    const filter = useMemo(() => readFilter(params), [params])
    const filterKey = filter.join(',')
    const [revision, setRevision] = useState(0)
    const [tree, setTree] = useState<ConstellationTree | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)
    // the hook reads the latest loader, so a filter change only has to change the revision
    const {state, loadMore, update} = useKeysetList(
        (cursor: string | undefined, signal: AbortSignal) => listNotes(cursor, signal, filter),
        `${revision}:${filterKey}`,
    )

    useEffect(() => subscribeToNotesChanges(() => setRevision((value) => value + 1)), [])

    useEffect(() => {
        const controller = new AbortController()
        listConstellations(controller.signal)
            .then((items) => setTree(buildConstellationTree(items)))
            // without the tree the filter still works; its chips go unnamed and the button hides
            .catch(() => undefined)
        return () => controller.abort()
    }, [revision])

    // filter changes replace the history entry: Back leaves the list instead of stepping through old filters
    const setFilter = (ids: readonly string[]) => setParams((current) => withFilter(current, ids), {replace: true})

    // a hand-edited URL: values the service would reject never stay in it
    useEffect(() => {
        if (params.getAll(FILTER_PARAM).join(',') !== filterKey) setFilter(filter)
    })

    // a constellation deleted meanwhile, or another user's, leaves the filter once the tree is known
    useEffect(() => {
        if (tree && knownFilter(filter, tree).length !== filter.length) setFilter(knownFilter(filter, tree))
    })

    const items = useMemo(() => tree ? pickerItems(tree) : [], [tree])
    const filterSlots: NotesFilterSlots = {
        button: tree && tree.flat.length > 0 ? <IconButton title={filter.length >= FILTER_LIMIT
            ? `Up to ${FILTER_LIMIT} constellations` : 'Filter by constellation'}
                                                         aria-expanded={pickerOpen}
                                                         disabled={filter.length >= FILTER_LIMIT}
                                                         onClick={() => setPickerOpen((open) => !open)}>
            <Icon name="filter" size={15}/>
        </IconButton> : undefined,
        bar: filter.length > 0 ? <div className="notes-filter-bar" aria-label="Constellation filter">
            {filter.map((id) => {
                const node = tree?.byId.get(id)
                const path = node ? [...node.ancestors, node].map((n) => n.name).join(' › ') : undefined
                return <span key={id} title={path}>
                    <ConstellationChip size="sm" label={node?.name ?? 'Constellation'}
                                       color={node ? constellationColor(node.hue, node.lightness) : 'var(--text-faint)'}
                                       onRemove={() => setFilter(filter.filter((other) => other !== id))}/>
                </span>
            })}
            <Button size="sm" variant="quiet" onClick={() => setFilter([])}>Clear</Button>
        </div> : undefined,
        picker: pickerOpen && tree ? <>
            <button type="button" className="notes-filter-scrim" tabIndex={-1} aria-hidden="true"
                    onClick={() => setPickerOpen(false)}/>
            <div className="notes-filter-picker">
                <ConstellationPicker items={items} exclude={filter} label="Find a constellation"
                                     action={(name) => `Show ${name}`}
                                     onPick={(id) => {
                                         setFilter(addToFilter(filter, id, tree))
                                         setPickerOpen(false)
                                     }}
                                     onClose={() => setPickerOpen(false)}/>
            </div>
        </> : undefined,
        count: state.status === 'ready' && state.total !== undefined && state.allTotal !== undefined
            ? `${state.total} of ${state.allTotal}` : undefined,
        onClear: filter.length > 0 ? () => setFilter([]) : undefined,
    }

    if (state.status === 'loading') {
        return <div className="product-view"><ScreenHeader kicker="Notes"/>{filterSlots.bar}
            <p className="notes-state">Loading…</p></div>
    }
    if (state.status === 'error') {
        return <div className="product-view"><ScreenHeader kicker="Notes"/>{filterSlots.bar}
            <div className="notes-state notes-state-error">
                <p>{describeError(state.error)}</p><Button size="sm" variant="quiet"
                                                           onClick={() => setRevision((value) => value + 1)}>Retry</Button>
            </div>
        </div>
    }
    return <NotesView notes={toNoteViewModels(state.items, noteChangedAt)} total={state.total}
                      onOpen={(note) => navigate(`/notes/${note.id}`)}
                      onStartChat={() => navigate('/chats')}
                      filter={filterSlots}
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
                              allTotal: current.allTotal === undefined ? undefined : Math.max(0, current.allTotal - 1),
                          })),
                      }}/>
}
