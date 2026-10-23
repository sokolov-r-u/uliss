import {type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState} from 'react'
import {Icon} from '../icons/Icon'
import {IconButton} from '../actions/IconButton'
import {Button} from '../actions/Button'
import {TagDot} from './TagDot'
import {NoteTitle, noteTitleText} from '../journal/NoteTitle'

// The one place-picker of the constellation tree. It opens on the roots only;
// a click selects a branch and unfolds it. The list shows five rows and
// scrolls beyond them. The action button under the list confirms the
// selection. A search stays in the tree: it marks the matches, unfolds the
// branches down to them and steps through them (the current match is the
// selection). Creating happens where the user stands: "+ New in <selected>"
// adds a sub-constellation, "+ New constellation" a root. Where a note can be
// a target too (`notes`), notes are tree nodes: in each of their
// constellations, sub-notes under their parent, the rest in a last branch.

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

/** A note as a tree node; picked notes become parents (Summarize under it, Move under a note). */
export interface ConstellationPickerNoteItem {
    id: string
    title: string
    /** The parent note; null for a note on its own. */
    parentId: string | null
    /** Constellations of a note on its own; a sub-note lives under its parent and leaves this empty. */
    constellationIds: string[]
    /** The note's emoji, shown before the title; the search reads the title only. */
    icon?: string | null
}

export interface ConstellationPickerNotes {
    /** Every note that may be a target; they join the tree and the search. */
    items: ConstellationPickerNoteItem[]
    /** Label of the confirm button for the selected note, e.g. `(title) => \`Move under ${title}\``; the title
     *  comes with the note's emoji ("🎷 Giant Steps"). */
    action: (title: string) => string
    /** Confirms the selected note. */
    onPick: (id: string) => void
}

export interface ConstellationPickerProps {
    /** The tree flattened in display order (parents before children). */
    items: ConstellationPickerItem[]
    /**
     * Ids that cannot be picked — a moving branch, a moving note — with their subtrees (sub-constellations, notes in
     * them, sub-notes). They are hidden.
     */
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
    /** Notes as targets too: they join the tree and the search. */
    notes?: ConstellationPickerNotes
    /** Fills its host's height (a `Notice` step) instead of showing five rows. */
    fill?: boolean
}

/** One row of the tree; a note in two constellations is two nodes with the same `id`. */
interface TreeNode {
    /** Unique in the tree: a constellation id, or the path of keys down to a note. */
    key: string
    kind: 'constellation' | 'note' | 'unplaced'
    id: string
    name: string
    depth: number
    /** Keys of the ancestors, root first. */
    ancestors: string[]
    color?: string
    count?: number
    /** A note's emoji; notes always keep its slot. */
    icon?: string | null
}

const ROW_TEXT = {
    fontFamily: 'var(--font-text)',
    fontSize: 10.5,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
} as const

const ROW_HEIGHT = 44

const ROW_BUTTON: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    minHeight: ROW_HEIGHT,
    border: 0,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
}

const STEP = 14

/** Rows shown before the list scrolls: five rows and the lines between them. */
const LIST_HEIGHT = 5 * ROW_HEIGHT + 4

const UNPLACED = '~unplaced'

/** Trimmed with whitespace runs collapsed, as the service stores names. */
const normalize = (raw: string) => raw.trim().replace(/\s+/g, ' ')

const byTitle = (a: ConstellationPickerNoteItem, b: ConstellationPickerNoteItem) =>
    a.title.localeCompare(b.title, undefined, {sensitivity: 'base'})

/**
 * The tree in display order: constellations with their sub-constellations first, then their notes; each note with its
 * sub-notes; notes with no constellation of the tree under one last branch (as roots when there are no
 * constellations). Excluded ids drop with everything below them; a cycle in bad data stops instead of hanging.
 */
function buildTree(items: ConstellationPickerItem[], notes: ConstellationPickerNoteItem[],
                   excluded: ReadonlySet<string>): TreeNode[] {
    const constellations = new Map(items.map((item) => [item.id, item]))
    const childConstellations = new Map<string | null, ConstellationPickerItem[]>()
    for (const item of items) {
        const siblings = childConstellations.get(item.parentId) ?? []
        siblings.push(item)
        childConstellations.set(item.parentId, siblings)
    }
    const noteIds = new Set(notes.map((note) => note.id))
    const subNotes = new Map<string, ConstellationPickerNoteItem[]>()
    const inConstellation = new Map<string, ConstellationPickerNoteItem[]>()
    const unplaced: ConstellationPickerNoteItem[] = []
    for (const note of [...notes].sort(byTitle)) {
        if (note.parentId && noteIds.has(note.parentId)) {
            const siblings = subNotes.get(note.parentId) ?? []
            siblings.push(note)
            subNotes.set(note.parentId, siblings)
            continue
        }
        const places = note.parentId ? [] : note.constellationIds.filter((id) => constellations.has(id))
        if (places.length === 0) unplaced.push(note)
        for (const id of places) {
            const here = inConstellation.get(id) ?? []
            here.push(note)
            inConstellation.set(id, here)
        }
    }

    const nodes: TreeNode[] = []
    const visitNote = (note: ConstellationPickerNoteItem, ancestors: string[], color: string | undefined,
                       chain: string[]) => {
        if (excluded.has(note.id) || chain.includes(note.id)) return
        const key = `${ancestors[ancestors.length - 1] ?? ''}/${note.id}`
        nodes.push({key, kind: 'note', id: note.id, name: note.title, depth: ancestors.length, ancestors, color,
            icon: note.icon ?? null})
        subNotes.get(note.id)?.forEach((child) => visitNote(child, [...ancestors, key], color, [...chain, note.id]))
    }
    const visitConstellation = (item: ConstellationPickerItem, ancestors: string[]) => {
        if (excluded.has(item.id) || ancestors.includes(item.id)) return
        nodes.push({key: item.id, kind: 'constellation', id: item.id, name: item.name, depth: ancestors.length,
            ancestors, color: item.color, count: item.count})
        const below = [...ancestors, item.id]
        childConstellations.get(item.id)?.forEach((child) => visitConstellation(child, below))
        inConstellation.get(item.id)?.forEach((note) => visitNote(note, below, item.color, []))
    }
    // Roots are the items whose parent is not in the tree.
    items.filter((item) => item.parentId == null || !constellations.has(item.parentId))
        .forEach((root) => visitConstellation(root, []))
    if (items.length === 0) {
        unplaced.forEach((note) => visitNote(note, [], undefined, []))
    } else if (unplaced.some((note) => !excluded.has(note.id))) {
        nodes.push({key: UNPLACED, kind: 'unplaced', id: UNPLACED, name: 'Without constellation', depth: 0, ancestors: []})
        unplaced.forEach((note) => visitNote(note, [UNPLACED], undefined, []))
    }
    return nodes
}

/** [name] with every occurrence of [needle] marked. */
function marked(name: string, needle: string): ReactNode {
    const lower = name.toLowerCase()
    // offsets of the lowercased name only hold when lowercasing keeps its length
    if (lower.length !== name.length) return name
    const parts: ReactNode[] = []
    let from = 0
    for (let at = lower.indexOf(needle); at >= 0 && needle; at = lower.indexOf(needle, from)) {
        if (at > from) parts.push(name.slice(from, at))
        parts.push(<mark key={at} style={MARK}>{name.slice(at, at + needle.length)}</mark>)
        from = at + needle.length
    }
    parts.push(name.slice(from))
    return parts
}

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
                                        fill = false,
                                    }: ConstellationPickerProps) {
    const [query, setQuery] = useState('')
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    /** The selection from before the search; it comes back while nothing matches. */
    const [beforeSearch, setBeforeSearch] = useState<string | null>(null)
    const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
    /** The parent a new constellation is being named under; undefined while not creating. */
    const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined)
    const [draft, setDraft] = useState('')
    const [creating, setCreating] = useState(false)
    const [searchFocused, setSearchFocused] = useState(false)
    /** Bumped when the search moves to a match, so its row scrolls into view. */
    const [reveal, setReveal] = useState(0)
    const rowRefs = useRef(new Map<string, HTMLElement>())

    const byId = new Map(items.map((item) => [item.id, item]))
    const excludeKey = [...exclude ?? []].join('\n')
    const noteItems = notes?.items
    const tree = useMemo(() => buildTree(items, noteItems ?? [], new Set(excludeKey ? excludeKey.split('\n') : [])),
        [items, noteItems, excludeKey])
    const byKey = new Map(tree.map((node) => [node.key, node]))
    const hasChildren = new Set(tree.map((node) => node.ancestors[node.ancestors.length - 1]).filter((key): key is string => key != null))
    const selected = selectedKey ? byKey.get(selectedKey) ?? null : null
    const selectedConstellation = selected?.kind === 'constellation' ? selected : null

    const typed = normalize(query)
    const needle = typed.toLowerCase()
    const matchesOf = (text: string) => text
        ? tree.filter((node) => node.kind !== 'unplaced' && node.name.toLowerCase().includes(text))
        : []
    const matches = matchesOf(needle)
    const current = selected ? matches.findIndex((node) => node.key === selected.key) : -1
    // The search unfolds the branches down to its matches only while it lasts.
    const shownOpen = needle ? new Set([...open, ...matches.flatMap((node) => node.ancestors)]) : open
    const visible = tree.filter((node) => node.ancestors.every((key) => shownOpen.has(key)))

    // A typed name goes in the selection kept from before the search; the current match is no parent for it.
    const createParent = selectedConstellation && current < 0 ? selectedConstellation.id : null
    const nameTaken = (name: string, parentId: string | null) =>
        items.some((item) => item.parentId === parentId && item.name.toLowerCase() === name.toLowerCase())
    const canCreateTyped = onCreate != null && needle !== '' && !nameTaken(typed, createParent)

    useEffect(() => {
        if (reveal > 0 && selectedKey) rowRefs.current.get(selectedKey)?.scrollIntoView?.({block: 'nearest'})
    }, [reveal, selectedKey])

    const select = (node: TreeNode) => {
        setSelectedKey(node.key)
        setBeforeSearch(node.key)
        setCreatingIn(undefined)
        // The selection unfolds, and stays reachable once the search is cleared.
        setOpen((current) => new Set([...current, node.key, ...node.ancestors]))
    }

    /** The search moves to a match: it becomes the selection and comes into view, without unfolding it. */
    const goTo = (node: TreeNode | undefined) => {
        if (!node) return
        setSelectedKey(node.key)
        setCreatingIn(undefined)
        setReveal((value) => value + 1)
    }

    const step = (by: number) => {
        if (matches.length === 0) return
        const from = current < 0 ? (by > 0 ? -1 : 0) : current
        goTo(matches[(from + by + matches.length) % matches.length])
    }

    const changeQuery = (next: string) => {
        const nextNeedle = normalize(next).toLowerCase()
        setQuery(next)
        if (nextNeedle === needle) return
        const from = needle ? beforeSearch : selectedKey
        if (!needle) setBeforeSearch(selectedKey)
        if (nextNeedle) {
            const first = matchesOf(nextNeedle)[0]
            if (first) goTo(first)
            else setSelectedKey(from)
        } else if (selected) {
            // A cleared search leaves the tree unfolded down to the selection.
            setOpen((current) => new Set([...current, ...selected.ancestors]))
        }
    }

    const toggle = (key: string) => setOpen((current) => {
        const next = new Set(current)
        if (next.has(key)) next.delete(key)
        else next.add(key)
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
                setSelectedKey(id)
                setOpen((current) => {
                    const next = new Set(current)
                    if (parentId) {
                        next.add(parentId)
                        byKey.get(parentId)?.ancestors.forEach((key) => next.add(key))
                    }
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

    const nodeRow = (node: TreeNode, first: boolean) => {
        const isSelected = node.key === selectedKey
        const isOpen = shownOpen.has(node.key)
        const isMatch = needle !== '' && node.kind !== 'unplaced' && node.name.toLowerCase().includes(needle)
        const name = isMatch ? marked(node.name, needle) : node.name
        return (
            <div role="listitem" key={node.key} ref={(element) => {
                if (element) rowRefs.current.set(node.key, element)
                else rowRefs.current.delete(node.key)
            }} style={{
                display: 'flex',
                alignItems: 'center',
                paddingLeft: node.depth * STEP,
                borderTop: first ? 'none' : '1px solid var(--line)',
                background: isSelected ? 'var(--bg-surface)' : 'transparent',
                boxShadow: isSelected ? `inset 2px 0 0 ${node.color ?? 'var(--accent-2)'}` : 'none',
            }}>
                <span style={{flex: '0 0 32px', display: 'flex', justifyContent: 'center'}}>
                    {hasChildren.has(node.key) &&
                        <IconButton s={32} title={`${isOpen ? 'Collapse' : 'Expand'} ${node.name}`}
                                    aria-expanded={isOpen} onClick={() => toggle(node.key)}>
                            <Icon name="chevron" size={10} rotate={isOpen ? 0 : -90}/>
                        </IconButton>}
                </span>
                {node.kind === 'unplaced'
                    ? <button type="button" aria-expanded={isOpen} onClick={() => toggle(node.key)} style={{
                        ...ROW_BUTTON, flex: 1, minWidth: 0, padding: '8px 11px 8px 0',
                    }}><span style={{...ROW_TEXT, fontSize: 9.5, color: 'var(--text-faint)'}}>{node.name}</span></button>
                    : <button type="button" aria-pressed={isSelected} onClick={() => select(node)} style={{
                        ...ROW_BUTTON,
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 11px 8px 0',
                    }}>
                        {node.kind === 'constellation'
                            ? <TagDot color={node.color ?? 'var(--text-faint)'} size={node.depth === 0 ? 8 : 6}/>
                            : <span style={{display: 'flex', color: node.color ?? 'var(--text-faint)'}}>
                                <Icon name="noteDoc" size={12}/>
                            </span>}
                        <span style={{
                            ...(node.kind === 'constellation' ? ROW_TEXT : NOTE_TEXT),
                            flex: 1,
                            minWidth: 0,
                            color: isSelected ? 'var(--accent-2)' : 'var(--cream)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>{node.kind === 'note' ? <NoteTitle title={name} icon={node.icon} slot/> : name}</span>
                        {node.count != null &&
                            <span style={{fontFamily: 'var(--font-text)', fontSize: 10, color: 'var(--text-faint)'}}>{node.count}</span>}
                    </button>}
            </div>
        )
    }

    const rows: ReactNode[] = []
    if (lead && !needle) {
        rows.push(quietRow('lead', 0, lead.label, lead.onSelect))
    }
    // "+ New in <selected>" goes after the selection's last visible descendant.
    const createAfter = !needle && selectedConstellation && onCreate
        ? visible.reduce((last, node, index) =>
            node.key === selectedConstellation.key || node.ancestors.includes(selectedConstellation.key) ? index : last, -1)
        : -1
    visible.forEach((node, index) => {
        rows.push(nodeRow(node, rows.length === 0))
        if (index === createAfter && selectedConstellation) rows.push(createRowFor(selectedConstellation))
    })

    function createRowFor(branch: TreeNode): ReactNode {
        return creatingIn === branch.id
            ? nameField(branch.id, branch.depth + 1)
            : quietRow(`add-${branch.id}`, branch.depth + 1, `+ New in ${branch.name}`,
                () => startCreating(branch.id), busy)
    }

    if (canCreateTyped) {
        rows.push(quietRow('create', 0, createParent ? `Create “${typed}” in ${byId.get(createParent)?.name}`
            : `Create “${typed}”`, () => void create(typed, createParent), creating || busy))
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
            height: fill ? '100%' : undefined,
            background: 'var(--bg-panel)',
            border: '1px solid var(--line-strong)',
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                borderBottom: `1px solid ${searchFocused ? 'var(--text-faint)' : 'var(--line)'}`,
            }}>
                <span style={{display: 'flex', paddingLeft: 11, color: searchFocused ? 'var(--cream)' : 'var(--text-faint)'}}>
                    <Icon name="search" size={13}/></span>
                <input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder={label}
                       aria-label={label} autoFocus
                       onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
                       onKeyDown={(event) => {
                           if (event.key === 'Escape' && onClose) {
                               // The picker owns this Escape; a host panel must not close with it.
                               event.preventDefault()
                               event.stopPropagation()
                               onClose()
                           } else if (needle && (event.key === 'Enter' || event.key === 'ArrowDown'
                               || event.key === 'ArrowUp')) {
                               event.preventDefault()
                               step(event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey) ? -1 : 1)
                           }
                       }}
                       // The bottom edge shows the focus; the global ring would frame the whole bar.
                       style={{...FIELD, minHeight: 44, padding: '0 8px', border: 'none', outline: 'none'}}/>
                {needle && <>
                    <span aria-live="polite" style={{fontFamily: 'var(--font-text)', fontSize: 11,
                        color: 'var(--text-faint)', whiteSpace: 'nowrap'}}>
                        {`${current + 1} / ${matches.length}`}
                    </span>
                    {/* the arrows keep the focus in the search field */}
                    <IconButton s={32} title="Previous match" disabled={matches.length === 0}
                                onMouseDown={(event) => event.preventDefault()} onClick={() => step(-1)}>
                        <Icon name="chevron" size={10} rotate={180}/>
                    </IconButton>
                    <IconButton s={32} title="Next match" disabled={matches.length === 0}
                                onMouseDown={(event) => event.preventDefault()} onClick={() => step(1)}>
                        <Icon name="chevron" size={10}/>
                    </IconButton>
                </>}
                {onClose && <IconButton s={44} title="Close picker" onClick={onClose}><Icon name="close" size={13}/></IconButton>}
            </div>
            <div role="list" style={fill ? {flex: 1, minHeight: 0, overflowY: 'auto'}
                : {maxHeight: LIST_HEIGHT, overflowY: 'auto'}}>
                {needle && matches.length === 0 && !canCreateTyped && <p style={{
                    margin: 0,
                    padding: '14px 11px',
                    fontFamily: 'var(--font-text)',
                    fontSize: 12,
                    color: 'var(--text-faint)',
                    borderBottom: '1px solid var(--line)',
                }}>{notes ? 'Nothing matches.' : 'Nothing in the tree matches.'}</p>}
                {rows}
            </div>
            <div style={{display: 'flex', padding: 8, borderTop: '1px solid var(--line)'}}>
                <Button size="sm" variant="primary" disabled={!selected || busy}
                        onClick={() => {
                            if (selected?.kind === 'constellation') onPick(selected.id)
                            else if (selected?.kind === 'note' && notes) notes.onPick(selected.id)
                        }}>
                    {selected?.kind === 'constellation' ? action(selected.name)
                        : selected?.kind === 'note' && notes ? notes.action(noteTitleText(selected.name, selected.icon))
                            : !notes ? 'Select a constellation' : items.length === 0 ? 'Select a note' : 'Select a place'}
                </Button>
            </div>
        </div>
    )
}

const FIELD: CSSProperties = {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    color: 'var(--cream)',
    fontFamily: 'var(--font-text)',
    fontSize: 12,
    letterSpacing: '1px',
}

const NOTE_TEXT: CSSProperties = {
    fontFamily: 'var(--font-text)',
    fontSize: 13,
}

const MARK: CSSProperties = {
    background: 'transparent',
    color: 'var(--accent-2)',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
}
