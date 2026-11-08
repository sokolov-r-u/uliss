import {type ReactNode, useEffect, useMemo, useState} from 'react'
import {Button, ConstellationChip, constellationColor, ConstellationPicker, EmptyState, Icon, IconButton, Kicker, ListRow, type Locale, noteTitleText, useLocale, useMessages} from '@uliss/design-system'
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
import {pinnedNotes as pinnedNotesStore, usePinnedNotes, withoutPinned} from '../ui/pins/pinned'
import {PinnedFailed} from '../ui/pins/PinnedFailed'
import {useFilteredPinned} from './useFilteredPinned'
import './notes.css'
import {formatShortDate} from '../ui/format'
import {commonMessages} from '../i18n/common.messages'
import {notesMessages} from './notes.messages'

export interface NotesViewProps {
    notes: NoteViewModel[]
    onOpen?: (note: NoteViewModel) => void
    onStartChat?: () => void
    /** Adds the "New note" button to the header's right corner. */
    onCreate?: () => void
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
    /** The pinned notes, shown above the months under their own label; [notes] leaves them out. */
    pinned?: NoteViewModel[]
    /** Said above the rows (e.g. that the pinned notes did not load); the list is not called empty while it is set. */
    notice?: ReactNode
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

export function NotesView({notes, onOpen, onStartChat, onCreate, actions, initialMenuId, total, footer, filter, pinned = [],
                              notice}: NotesViewProps) {
    const locale = useLocale()
    const t = useMessages(notesMessages)
    const common = useMessages(commonMessages)
    const unread = [...pinned, ...notes].filter((note) => note.unread).length
    const filtered = filter?.onClear !== undefined
    const count = (filtered ? filter?.count : undefined) ?? total ?? pinned.length + notes.length
    const create = onCreate && <IconButton title={t.newNote} onClick={onCreate}><Icon name="plus" size={16}/></IconButton>
    const header = (right?: ReactNode) => <ScreenHeader kicker={common.notes} count={count}
                                                        right={right || filter?.button || create ? <span className="notes-head-actions">
                                                            {right}{filter?.button}{create}
                                                        </span> : undefined}/>

    if (notes.length === 0 && pinned.length === 0 && !notice) {
        return <div className="product-view">{header()}
            {filter?.bar}
            <div className="product-body"><div className="product-empty">
                {filtered
                    ? <EmptyState title={t.noFiltered} body={t.noFilteredBody}
                                  action={t.clearFilter} onAction={filter?.onClear}/>
                    : <EmptyState title={t.noNotes} body={t.noNotesBody}
                                  action={t.startChat} onAction={onStartChat}/>}
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
                 menuLabel={common.actionsFor(noteTitleText(note.title, note.icon))}/>

    return (
        <div className="product-view">
            {header(unread > 0 ? <Kicker size={9} spacing="2px" color="var(--text-faint)">{t.unread(unread)}</Kicker> : undefined)}
            {filter?.bar}
            <div className="product-body"><div className="product-list">
                {notice}
                {[
                    ...(pinned.length > 0 ? [{label: common.pinned, items: pinned}] : []),
                    ...groupByMonth(notes, (note) => note.listedAt, locale),
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
            {filter?.picker}
        </div>
    )
}

function contentParts(content: string | null, fallbackTitle: string, storedTitle?: string): { title: string; excerpt: string } {
    const lines = content?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? []
    const normalized = lines.join(' ').replace(/\s+/g, ' ').trim()
    if (storedTitle) return {title: storedTitle, excerpt: normalized}
    // Notes created before stored titles fall back to their first content line.
    const first = lines[0]?.replace(/\s+/g, ' ').trim() ?? fallbackTitle
    const title = first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first
    const excerpt = normalized.startsWith(first) ? normalized.slice(first.length).trim() : normalized
    return {title, excerpt}
}

/** Row models; [listedAt] picks the time a row shows and is grouped by (creation unless the list orders otherwise). */
export function toNoteViewModels(notes: Note[], locale: Locale,
                                 listedAt: (note: Note) => string | undefined = (note) => note.createdAt):
    NoteViewModel[] {
    const t = notesMessages[locale]
    return notes.map((note, index) => {
        const content = contentParts(note.content, t.readyNote, note.title)
        // a name the user gave a summary is shown while the note is still being written
        const title = note.status === 'GENERATING'
            ? note.title || t.generating
            : note.status === 'FAILED' ? t.summaryFailed : content.title
        return {
            id: note.id,
            ordinal: notes.length - index,
            title,
            icon: note.icon ?? null,
            excerpt: note.status === 'READY' ? content.excerpt
                : note.status === 'GENERATING' && note.title ? t.generating : '',
            date: formatShortDate(listedAt(note), locale),
            linkCount: 0,
            renamable: note.status === 'READY',
            listedAt: listedAt(note),
        }
    })
}

export function NotesPage() {
    const navigate = useNavigate()
    const locale = useLocale()
    const t = useMessages(notesMessages)
    const common = useMessages(commonMessages)
    const [params, setParams] = useSearchParams()
    const filter = useMemo(() => readFilter(params), [params])
    const filterKey = filter.join(',')
    const [revision, setRevision] = useState(0)
    const [tree, setTree] = useState<ConstellationTree | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)
    // the hook reads the latest loader; the filter is the list's key, so a failed reload never shows another list
    const {state, loadMore, update} = useKeysetList(
        (cursor: string | undefined, signal: AbortSignal) => listNotes(cursor, signal, filter),
        revision,
        filterKey,
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

    const allPinned = usePinnedNotes()
    // the Pinned group follows the filter too
    const {state: pinned, retry: retryPinned} = useFilteredPinned(filter, revision, allPinned)
    const pickerList = useMemo(() => tree ? pickerItems(tree) : [], [tree])
    const filterSlots: NotesFilterSlots = {
        button: tree && tree.flat.length > 0 ? <IconButton title={filter.length >= FILTER_LIMIT
            ? t.filterLimit(FILTER_LIMIT) : t.filterBy}
                                                         aria-expanded={pickerOpen}
                                                         disabled={filter.length >= FILTER_LIMIT}
                                                         onClick={() => setPickerOpen((open) => !open)}>
            <Icon name="filter" size={15}/>
        </IconButton> : undefined,
        bar: filter.length > 0 ? <div className="notes-filter-bar" aria-label={t.filterBar}>
            {filter.map((id) => {
                const node = tree?.byId.get(id)
                const path = node ? [...node.ancestors, node].map((n) => n.name).join(' › ') : undefined
                return <span key={id} title={path}>
                    <ConstellationChip size="sm" label={node?.name ?? t.constellation}
                                       color={node ? constellationColor(node.hue, node.lightness) : 'var(--text-faint)'}
                                       onRemove={() => setFilter(filter.filter((other) => other !== id))}/>
                </span>
            })}
            <Button size="sm" variant="quiet" onClick={() => setFilter([])}>{t.clear}</Button>
        </div> : undefined,
        picker: pickerOpen && tree ? <>
            <button type="button" className="notes-filter-scrim" tabIndex={-1} aria-hidden="true"
                    onClick={() => setPickerOpen(false)}/>
            <div className="notes-filter-picker">
                <ConstellationPicker items={pickerList} exclude={filter} label={t.findConstellation}
                                     action={t.show}
                                     onPick={(id) => {
                                         setFilter(addToFilter(filter, id, tree))
                                         setPickerOpen(false)
                                     }}
                                     onClose={() => setPickerOpen(false)}/>
            </div>
        </> : undefined,
        count: state.status === 'ready' && state.total !== undefined && state.allTotal !== undefined
            ? t.filteredCount(state.total, state.allTotal) : undefined,
        onClear: filter.length > 0 ? () => setFilter([]) : undefined,
    }

    const sharedPinned = allPinned.status === 'ready' ? allPinned.items : []
    // a row pinned here belongs to the filter: it joins the filtered Pinned group at once, before the refetch confirms it
    const justPinned = filter.length > 0 && state.status === 'ready' && pinned.status === 'ready'
        ? sharedPinned.filter((note) => state.items.some((row) => row.id === note.id)
            && !pinned.items.some((shown) => shown.id === note.id))
        : []
    const pinnedNotes = pinned.status === 'ready' ? [...justPinned, ...pinned.items] : []
    // a pinned note lives only in the Pinned group, also while a page fetched before the pin is still shown; pages
    // leave out every pinned note, filtered or not
    const items = state.status === 'ready'
        ? withoutPinned(state.items, sharedPinned) : []
    // "Nothing written down yet" waits for the pinned list: every note may be pinned
    // writing a note by hand needs no list: the button is there while it loads or after it fails
    const createOnly = <span className="notes-head-actions">
        <IconButton title={t.newNote} onClick={() => navigate('/notes/new')}><Icon name="plus" size={16}/></IconButton>
    </span>
    if (state.status === 'loading' || (state.status === 'ready' && pinned.status === 'loading' && items.length === 0)) {
        return <div className="product-view"><ScreenHeader kicker={common.notes} right={createOnly}/>{filterSlots.bar}
            <p className="notes-state">{common.loading}</p></div>
    }
    if (state.status === 'error') {
        return <div className="product-view"><ScreenHeader kicker={common.notes} right={createOnly}/>{filterSlots.bar}
            <div className="notes-state notes-state-error">
                <p>{describeError(state.error, locale)}</p><Button size="sm" variant="quiet"
                                                           onClick={() => setRevision((value) => value + 1)}>{common.retry}</Button>
            </div>
        </div>
    }
    return <NotesView notes={toNoteViewModels(items, locale, noteChangedAt)} total={state.total}
                      pinned={toNoteViewModels(pinnedNotes, locale, noteChangedAt)}
                      notice={pinned.status === 'error' || allPinned.status === 'error'
                          ? <PinnedFailed onRetry={() => {
                              pinnedNotesStore.refresh()
                              if (filter.length > 0) retryPinned()
                          }}/>
                          : undefined}
                      onOpen={(note) => navigate(`/notes/${note.id}`)}
                      onStartChat={() => navigate('/chats')}
                      onCreate={() => navigate('/notes/new')}
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
