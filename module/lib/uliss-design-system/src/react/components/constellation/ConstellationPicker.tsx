import {type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState} from 'react'
import {Icon} from '../icons/Icon'
import {IconButton} from '../actions/IconButton'
import {Button} from '../actions/Button'
import {TagDot} from './TagDot'

// The one place-picker of the constellation tree. It opens on the roots only;
// a click selects a branch and unfolds it, so the user walks down level by
// level instead of scrolling the whole tree. The action button under the list
// confirms the selected branch. A search swaps the tree for a flat list of
// hits with their path. Creating happens where the user stands: "+ New in
// <selected>" adds a sub-constellation, "+ New constellation" a root.
// Where a note can be a target too (`notes`), the search also asks the host
// for notes and lists them under the constellations.

export interface ConstellationPickerItem {
    id: string
    /** null for a root. */
    parentId: string | null
    name: string
    /** 0 for a root. */
    depth: number
    /** Ancestor names, root first; empty for a root. */
    path: string[]
    /** Resolved branch colour (`constellationColor`). */
    color: string
    /** Stars in the subtree; omitted hides the count. */
    count?: number
}

/** A note found by `notes.search`; picked notes become parents (Summarize under it, Move under a note). */
export interface ConstellationPickerNote {
    id: string
    title: string
    /** Where the note lives: constellation names, then parent note titles; empty without a place. */
    path: string[]
    /** Colour of the constellation it lives in; omitted without one. */
    color?: string
}

export interface ConstellationPickerNotes {
    /** Finds notes for the typed text; the picker waits a moment after typing and aborts stale searches. */
    search: (query: string, signal: AbortSignal) => Promise<ConstellationPickerNote[]>
    /** Label of the confirm button for the selected note, e.g. `(title) => \`Move under ${title}\``. */
    action: (title: string) => string
    /** Confirms the selected note. */
    onPick: (id: string) => void
}

export interface ConstellationPickerProps {
    /** The tree flattened in display order (parents before children). */
    items: ConstellationPickerItem[]
    /** Ids that cannot be picked — e.g. a moving branch and its descendants. Their subtrees are hidden. */
    exclude?: Iterable<string>
    /** Label of the confirm button for the selected branch, e.g. `(name) => \`Add to ${name}\``. */
    action: (name: string) => string
    /** Confirms the selected branch. */
    onPick: (id: string) => void
    onClose?: () => void
    /** A first row above the tree that acts at once, e.g. `{label: 'Make it a root'}`. Hidden while searching. */
    lead?: { label: string; onSelect: () => void }
    /**
     * Creates a constellation named `name` under `parentId` (null: a root) and resolves to its id, which becomes the
     * selection once `items` contain it. Leave it out where creating makes no sense (moving a branch).
     */
    onCreate?: (name: string, parentId: string | null) => Promise<string | undefined>
    /** A change from the host is being stored: the action and creation wait. */
    busy?: boolean
    /** Accessible name of the search field. */
    label?: string
    /** Notes as targets too: typing also searches them, listed under the constellations. */
    notes?: ConstellationPickerNotes
}

const ROW_TEXT = {
    fontFamily: 'var(--font-text)',
    fontSize: 10.5,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
} as const

const ROW_BUTTON: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    minHeight: 44,
    border: 0,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
}

const STEP = 14

/** Typing pause before the picker asks the host for notes. */
const NOTE_SEARCH_DELAY = 250

type NoteSearch =
    | { status: 'idle' }
    | { status: 'loading'; query: string }
    | { status: 'ready'; query: string; hits: ConstellationPickerNote[] }
    | { status: 'error'; query: string }

/** Trimmed with whitespace runs collapsed, as the service stores names. */
const normalize = (raw: string) => raw.trim().replace(/\s+/g, ' ')

export function ConstellationPicker({
                                        items,
                                        exclude,
                                        action,
                                        onPick,
                                        onClose,
                                        lead,
                                        onCreate,
                                        busy = false,
                                        label = 'Search the tree',
                                        notes,
                                    }: ConstellationPickerProps) {
    const [query, setQuery] = useState('')
    const [selectedId, setSelectedId] = useState<string | null>(null)
    /** A picked note; it stays selected while the search changes, so its action stays at hand. */
    const [selectedNote, setSelectedNote] = useState<ConstellationPickerNote | null>(null)
    const [noteSearch, setNoteSearch] = useState<NoteSearch>({status: 'idle'})
    const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
    /** The parent a new constellation is being named under; undefined while not creating. */
    const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined)
    const [draft, setDraft] = useState('')
    const [creating, setCreating] = useState(false)

    const byId = new Map(items.map((item) => [item.id, item]))
    const excluded = new Set(exclude ?? [])
    // computed once per items, not per item on every keystroke; a cycle in bad data stops instead of hanging
    const ancestors = useMemo(() => {
        const parents = new Map(items.map((item) => [item.id, item.parentId]))
        return new Map(items.map((item) => {
            const chain: string[] = []
            for (let id = item.parentId; id && id !== item.id && !chain.includes(id); id = parents.get(id) ?? null) {
                chain.push(id)
            }
            return [item.id, chain]
        }))
    }, [items])
    const ancestorsOf = (item: ConstellationPickerItem) => ancestors.get(item.id) ?? []
    const pickable = items.filter((item) => !excluded.has(item.id) && !ancestorsOf(item).some((id) => excluded.has(id)))
    const hasChildren = new Set(pickable.map((item) => item.parentId).filter((id): id is string => id != null))
    const selected = selectedId ? pickable.find((item) => item.id === selectedId) ?? null : null

    const typed = normalize(query)
    const needle = typed.toLowerCase()
    const hits = needle
        ? pickable.filter((item) => [...item.path, item.name].some((name) => name.toLowerCase().includes(needle)))
        : pickable.filter((item) => ancestorsOf(item).every((id) => open.has(id)))
    const createParent = selected?.id ?? null
    const nameTaken = (name: string, parentId: string | null) =>
        items.some((item) => item.parentId === parentId && item.name.toLowerCase() === name.toLowerCase())
    const canCreateTyped = onCreate != null && needle !== '' && !nameTaken(typed, createParent)
    // The latest search function, so a host passing a fresh closure each render does not restart the search.
    const searchRef = useRef(notes?.search)
    searchRef.current = notes?.search
    const searchesNotes = notes != null

    useEffect(() => {
        const search = searchRef.current
        if (!searchesNotes || !search || !typed) {
            setNoteSearch({status: 'idle'})
            return
        }
        const controller = new AbortController()
        setNoteSearch({status: 'loading', query: typed})
        const timer = setTimeout(() => {
            search(typed, controller.signal)
                .then((hits) => {
                    if (!controller.signal.aborted) setNoteSearch({status: 'ready', query: typed, hits})
                })
                .catch(() => {
                    if (!controller.signal.aborted) setNoteSearch({status: 'error', query: typed})
                })
        }, NOTE_SEARCH_DELAY)
        return () => {
            clearTimeout(timer)
            controller.abort()
        }
    }, [searchesNotes, typed])

    const noteHits = noteSearch.status === 'ready' && noteSearch.query === typed ? noteSearch.hits : []

    const select = (item: ConstellationPickerItem) => {
        setSelectedId(item.id)
        setSelectedNote(null)
        setCreatingIn(undefined)
        // The selection unfolds, and stays reachable once the search is cleared.
        setOpen((current) => new Set([...current, item.id, ...ancestorsOf(item)]))
    }

    const toggle = (id: string) => setOpen((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })

    async function create(name: string, parentId: string | null) {
        if (!onCreate || creating || busy || !name || nameTaken(name, parentId)) return
        setCreating(true)
        try {
            const id = await onCreate(name, parentId)
            setCreatingIn(undefined)
            setDraft('')
            setQuery('')
            if (id) {
                setSelectedId(id)
                setSelectedNote(null)
                setOpen((current) => {
                    const next = new Set(current)
                    if (parentId) next.add(parentId)
                    return next
                })
            }
        } catch {
            // The host reports the failure; the draft stays for another try.
        } finally {
            setCreating(false)
        }
    }

    const startCreating = (parentId: string | null) => {
        setDraft('')
        setCreatingIn(parentId)
    }

    const nameField = (parentId: string | null, depth: number) => (
        <div role="listitem" key={`new-${parentId ?? 'root'}`}
             style={{display: 'flex', alignItems: 'center', gap: 6, padding: `4px 6px 4px ${11 + depth * STEP}px`,
                 borderTop: '1px solid var(--line)'}}>
            <input value={draft} autoFocus maxLength={80} disabled={creating}
                   aria-label={parentId ? `New constellation in ${byId.get(parentId)?.name}` : 'New constellation'}
                   placeholder={parentId ? `New in ${byId.get(parentId)?.name}` : 'New constellation'}
                   onChange={(event) => setDraft(event.target.value)}
                   onKeyDown={(event) => {
                       if (event.key === 'Enter') {
                           event.preventDefault()
                           void create(normalize(draft), parentId)
                       } else if (event.key === 'Escape') {
                           event.preventDefault()
                           event.stopPropagation()
                           setCreatingIn(undefined)
                       }
                   }}
                   style={{...FIELD, minHeight: 36, padding: '0 6px', border: '1px solid var(--line-strong)'}}/>
            {nameTaken(normalize(draft), parentId) &&
                <span role="status" style={{fontFamily: 'var(--font-text)', fontSize: 11, color: 'var(--text-faint)'}}>
                    Taken here
                </span>}
            <Button size="sm" variant="quiet" disabled={creating || busy || !normalize(draft)
                || nameTaken(normalize(draft), parentId)}
                    onClick={() => void create(normalize(draft), parentId)}>{creating ? 'Creating…' : 'Create'}</Button>
        </div>
    )

    const quietRow = (key: string, depth: number, text: ReactNode, onSelect: () => void, disabled = false) => (
        <div role="listitem" key={key}>
            <button type="button" onClick={onSelect} disabled={disabled} style={{
                ...ROW_BUTTON,
                width: '100%',
                padding: `8px 11px 8px ${11 + depth * STEP}px`,
                borderTop: '1px solid var(--line)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
            }}><span style={{...ROW_TEXT, fontSize: 9.5, color: 'var(--accent-2)'}}>{text}</span></button>
        </div>
    )

    const rows: ReactNode[] = []
    if (lead && !needle) {
        rows.push(quietRow('lead', 0, lead.label, lead.onSelect))
    }
    // "+ New in <selected>" goes after the selection's last visible descendant.
    const createAfter = !needle && selected && onCreate
        ? hits.reduce((last, item, index) =>
            item.id === selected.id || ancestorsOf(item).includes(selected.id) ? index : last, -1)
        : -1
    hits.forEach((item, index) => {
        const isSelected = item.id === selectedId
        const isOpen = open.has(item.id)
        rows.push(
            <div role="listitem" key={item.id} style={{
                display: 'flex',
                alignItems: 'center',
                paddingLeft: needle ? 0 : item.depth * STEP,
                borderTop: rows.length === 0 ? 'none' : '1px solid var(--line)',
                background: isSelected ? 'var(--bg-surface)' : 'transparent',
                boxShadow: isSelected ? `inset 2px 0 0 ${item.color}` : 'none',
            }}>
                {!needle && <span style={{flex: '0 0 32px', display: 'flex', justifyContent: 'center'}}>
                    {hasChildren.has(item.id) &&
                        <IconButton s={32} title={`${isOpen ? 'Collapse' : 'Expand'} ${item.name}`}
                                    aria-expanded={isOpen} onClick={() => toggle(item.id)}>
                            <Icon name="chevron" size={10} rotate={isOpen ? 0 : -90}/>
                        </IconButton>}
                </span>}
                <button type="button" aria-pressed={isSelected} onClick={() => select(item)} style={{
                    ...ROW_BUTTON,
                    flex: 1,
                    minWidth: 0,
                    padding: needle ? '8px 11px' : '8px 11px 8px 0',
                }}>
                    <TagDot color={item.color} size={item.depth === 0 ? 8 : 6}/>
                    <span style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3}}>
                        <span style={{
                            ...ROW_TEXT,
                            color: isSelected ? 'var(--accent-2)' : 'var(--cream)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>{item.name}</span>
                        {needle && item.path.length > 0 && <span style={{
                            ...ROW_TEXT,
                            fontSize: 8.5,
                            letterSpacing: '1.4px',
                            color: 'var(--text-faint)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>{item.path.join(' › ')}</span>}
                    </span>
                    {item.count != null &&
                        <span style={{fontFamily: 'var(--font-text)', fontSize: 10, color: 'var(--text-faint)'}}>{item.count}</span>}
                </button>
            </div>,
        )
        if (index === createAfter && selected) rows.push(createRowFor(selected))
    })

    function createRowFor(branch: ConstellationPickerItem): ReactNode {
        return creatingIn === branch.id
            ? nameField(branch.id, branch.depth + 1)
            : quietRow(`add-${branch.id}`, branch.depth + 1, `+ New in ${branch.name}`,
                () => startCreating(branch.id), busy)
    }

    if (notes && needle && (noteHits.length > 0 || noteSearch.status !== 'ready')) {
        rows.push(
            <div role="listitem" key="notes-head" style={{
                padding: '10px 11px 6px',
                borderTop: rows.length === 0 ? 'none' : '1px solid var(--line)',
                ...ROW_TEXT,
                fontSize: 8.5,
                letterSpacing: '2.2px',
                color: 'var(--text-faint)',
            }}>{noteSearch.status === 'error' ? 'Could not search the notes'
                : noteSearch.status === 'ready' ? 'Notes' : 'Searching the notes…'}</div>,
        )
        noteHits.forEach((note) => {
            const isSelected = note.id === selectedNote?.id
            rows.push(
                <div role="listitem" key={`note-${note.id}`} style={{
                    borderTop: '1px solid var(--line)',
                    background: isSelected ? 'var(--bg-surface)' : 'transparent',
                    boxShadow: isSelected ? `inset 2px 0 0 ${note.color ?? 'var(--accent-2)'}` : 'none',
                }}>
                    <button type="button" aria-pressed={isSelected} onClick={() => {
                        setSelectedNote(note)
                        setSelectedId(null)
                        setCreatingIn(undefined)
                    }} style={{...ROW_BUTTON, width: '100%', padding: '8px 11px'}}>
                        <span style={{display: 'flex', color: note.color ?? 'var(--text-faint)'}}>
                            <Icon name="noteDoc" size={12}/>
                        </span>
                        <span style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3}}>
                            <span style={{
                                fontFamily: 'var(--font-text)',
                                fontSize: 13,
                                color: isSelected ? 'var(--accent-2)' : 'var(--cream)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>{note.title}</span>
                            {note.path.length > 0 && <span style={{
                                ...ROW_TEXT,
                                fontSize: 8.5,
                                letterSpacing: '1.4px',
                                color: 'var(--text-faint)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>{note.path.join(' › ')}</span>}
                        </span>
                    </button>
                </div>,
            )
        })
    }
    if (canCreateTyped) {
        rows.push(quietRow('create', 0, selected ? `Create “${typed}” in ${selected.name}` : `Create “${typed}”`,
            () => void create(typed, createParent), creating || busy))
    }
    if (!needle && onCreate) {
        rows.push(creatingIn === null
            ? nameField(null, 0)
            : quietRow('new-root', 0, '+ New constellation', () => startCreating(null), busy))
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-panel)',
            border: '1px solid var(--line-strong)',
        }}>
            <div style={{display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--line)'}}>
                <span style={{display: 'flex', paddingLeft: 11, color: 'var(--text-faint)'}}><Icon name="search" size={13}/></span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={label}
                       aria-label={label} autoFocus
                       onKeyDown={(event) => {
                           if (event.key === 'Escape' && onClose) {
                               // The picker owns this Escape; a host panel must not close with it.
                               event.preventDefault()
                               event.stopPropagation()
                               onClose()
                           }
                       }}
                       style={{...FIELD, minHeight: 44, padding: '0 8px', border: 'none'}}/>
                {onClose && <IconButton s={44} title="Close picker" onClick={onClose}><Icon name="close" size={13}/></IconButton>}
            </div>
            <div role="list" style={{maxHeight: 300, overflowY: 'auto'}}>
                {rows}
                {notes && items.length === 0 && !needle && <p style={{
                    margin: 0,
                    padding: '14px 11px',
                    fontFamily: 'var(--font-text)',
                    fontSize: 12,
                    color: 'var(--text-faint)',
                }}>Type to find a note.</p>}
                {needle && hits.length === 0 && !canCreateTyped
                    && (!notes || (noteSearch.status === 'ready' && noteHits.length === 0)) && <p style={{
                    margin: 0,
                    padding: '14px 11px',
                    fontFamily: 'var(--font-text)',
                    fontSize: 12,
                    color: 'var(--text-faint)',
                }}>{notes ? 'Nothing matches.' : 'Nothing in the tree matches.'}</p>}
            </div>
            <div style={{display: 'flex', padding: 8, borderTop: '1px solid var(--line)'}}>
                <Button size="sm" variant="primary" disabled={(!selected && !selectedNote) || busy}
                        onClick={() => {
                            if (selected) onPick(selected.id)
                            else if (selectedNote && notes) notes.onPick(selectedNote.id)
                        }}>
                    {selected ? action(selected.name)
                        : selectedNote && notes ? notes.action(selectedNote.title)
                            : !notes ? 'Select a constellation' : items.length === 0 ? 'Select a note' : 'Select a place'}
                </Button>
            </div>
        </div>
    )
}

// no inline outline: the global :focus-visible ring must show on these inputs
const FIELD: CSSProperties = {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    color: 'var(--cream)',
    fontFamily: 'var(--font-text)',
    fontSize: 12,
    letterSpacing: '1px',
}
