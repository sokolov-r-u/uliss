import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Link} from 'react-router-dom'
import {
    Button,
    ConstellationChip,
    ConstellationPicker,
    constellationColor,
    Icon,
    IconButton,
    TagDot,
} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {
    addNoteConstellation,
    type Constellation,
    ConstellationApiError,
    createConstellation,
    getNotePlace,
    listConstellations,
    moveNoteOut,
    moveNoteUnder,
    type NoteMembership,
    type NotePlace,
    type NoteRef,
    removeNoteConstellation,
    searchNotes,
    setMainNoteConstellation,
} from './constellationApi'
import {
    buildConstellationTree,
    type ConstellationNode,
    type ConstellationTree,
    pickerItems,
    pickerNote,
} from './constellationTree'
import {notifyNotesChanged} from '../notes/noteApi'
import './note-constellation.css'

/** main: choose among the note's places; add: a new place; under: a parent note; out: out from under the parent. */
type Picker = 'main' | 'add' | 'under' | 'out' | null

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; items: Constellation[]; tree: ConstellationTree; place: NotePlace }

/** The user's message for a failed change of the note's places. */
export function placementFailureMessage(error: unknown, name?: string): string {
    if (error instanceof ConstellationApiError) {
        if (error.code === 'CONSTELLATION_NAME_TAKEN') return `“${name}” is already taken. Pick it from the list.`
        if (error.code === 'NOTE_PLACE_INHERITED') return 'This note lives where its parent note lives.'
        if (error.code === 'NOTE_MOVE_CYCLE') return 'A note cannot go under itself or its own sub-notes.'
        if (error.code === 'PARENT_NOTE_NOT_FOUND') return 'That note no longer exists. Pick another one.'
        if (error.status === 404) return 'This note or constellation no longer exists. Reload the page.'
        if (error.status === 400 && name !== undefined) return 'Use a name of 1 to 40 characters.'
        if (error.kind === 'transport') return 'The note service is unavailable. Try again.'
    }
    return 'Could not save the change. Try again.'
}

/**
 * The "Constellation" section of a note's panel: the main place as a path with ×, the other places as chips (× removes
 * one) and "+ Add constellation". A click on the main place offers the note's other places to make one main; adding
 * goes through the shared tree picker, which can also create a constellation where the user stands. "Move under a
 * note" hangs the note under another one. A sub-note shows its path through its parent notes instead, explains that
 * its place is inherited and offers "Move out" and "Move under another note".
 */
export function NoteConstellationSection({noteId, noteTitle}: { noteId: string; noteTitle?: string }) {
    const [load, setLoad] = useState<LoadState>({status: 'loading'})
    const [picker, setPicker] = useState<Picker>(null)
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const pendingRef = useRef(false)

    const reload = useCallback(async (signal?: AbortSignal) => {
        try {
            const [items, place] = await Promise.all([
                listConstellations(signal),
                getNotePlace(noteId, signal),
            ])
            setLoad({status: 'ready', items, tree: buildConstellationTree(items), place})
        } catch (e) {
            if (e instanceof AuthRequiredError || signal?.aborted) return
            setLoad({status: 'error'})
        }
    }, [noteId])

    useEffect(() => {
        const controller = new AbortController()
        setLoad({status: 'loading'})
        setPicker(null)
        setError(null)
        void reload(controller.signal)
        return () => controller.abort()
    }, [reload])

    /**
     * Runs one change at a time; the service answers with the note's new places, or with its whole new place after a
     * move under or out from under a note, which also changes the sub-note lists.
     */
    async function run(change: () => Promise<NoteMembership[] | NotePlace>) {
        if (pendingRef.current) return
        pendingRef.current = true
        setPending(true)
        setError(null)
        try {
            const result = await change()
            const place: (current: NotePlace) => NotePlace = Array.isArray(result)
                ? (current) => ({...current, constellations: result})
                : () => result
            setLoad((current) => current.status === 'ready' ? {...current, place: place(current.place)} : current)
            if (!Array.isArray(result)) notifyNotesChanged()
            setPicker(null)
        } catch (e) {
            if (!(e instanceof AuthRequiredError)) setError(placementFailureMessage(e))
        } finally {
            pendingRef.current = false
            setPending(false)
        }
    }

    function add(constellationId: string) {
        if (load.status !== 'ready') return
        // A pick that changes nothing says so instead of closing the picker as if it worked.
        if (load.place.constellations.some((membership) => membership.constellationId === constellationId)) {
            setError(`The note is already in ${load.tree.byId.get(constellationId)?.name}.`)
            return
        }
        void run(() => addNoteConstellation(noteId, constellationId))
    }

    /** Creates a constellation for the picker, which then selects it; the note is placed only by the action button. */
    async function createIn(name: string, parentId: string | null): Promise<string | undefined> {
        setError(null)
        try {
            const created = await createConstellation(name, parentId)
            const fresh = await listConstellations().catch(() => null)
            // Without a fresh tree the new branch is added locally, so the picker can still select it.
            setLoad((current) => {
                if (current.status !== 'ready') return current
                const items = fresh ?? [...current.items, created]
                return {...current, items, tree: buildConstellationTree(items)}
            })
            return created.id
        } catch (e) {
            if (!(e instanceof AuthRequiredError)) setError(placementFailureMessage(e, name))
            throw e
        }
    }

    const items = useMemo(() => load.status === 'ready' ? pickerItems(load.tree) : [], [load])
    const tree = load.status === 'ready' ? load.tree : null
    /** Notes the picker offers as a parent: never this note or its sub-notes (the service leaves them out). */
    const findParents = useCallback(async (query: string, signal: AbortSignal) => {
        const hits = await searchNotes(query, noteId, signal)
        return tree ? hits.map((hit) => pickerNote(hit, tree)) : []
    }, [noteId, tree])
    const underPicker = (label: string) => <div className="note-places-picker">
        <ConstellationPicker items={[]} label={label} action={(name) => name} busy={pending}
                             onPick={() => undefined} onClose={() => setPicker(null)}
                             notes={{
                                 search: findParents,
                                 action: (title) => `Move under ${title}`,
                                 onPick: (parentId) => void run(() => moveNoteUnder(noteId, parentId)),
                             }}/>
    </div>

    if (load.status === 'loading') return <p className="context-text">Loading…</p>
    if (load.status === 'error') {
        return <div className="note-places-state">
            <p className="context-text">Could not load the constellations.</p>
            <Button size="sm" variant="quiet" onClick={() => {
                setLoad({status: 'loading'})
                void reload()
            }}>Retry</Button>
        </div>
    }

    const {place} = load
    // A place deleted meanwhile in another tab is left out until the next load.
    const placed = place.constellations
        .map((membership) => ({membership, node: load.tree.byId.get(membership.constellationId)}))
        .filter((item): item is { membership: NoteMembership; node: ConstellationNode } => item.node != null)
    const main = placed.find((item) => item.membership.main)?.node ?? null
    const others = placed.filter((item) => !item.membership.main).map((item) => item.node)
    const toggle = (next: Exclude<Picker, null>) => {
        setError(null)
        setPicker((current) => current === next ? null : next)
    }

    if (place.ancestors.length > 0) {
        const parent = place.ancestors[place.ancestors.length - 1]
        return (
            <div className="note-places" aria-busy={pending || undefined}>
                <SubNotePath main={main} ancestors={place.ancestors} title={noteTitle}/>
                <p className="context-text">Lives where {parent.title || 'its parent note'} lives.</p>
                <div className="note-places-chips">
                    <button type="button" className="note-places-add" disabled={pending}
                            aria-expanded={picker === 'out'} onClick={() => toggle('out')}>Move out
                    </button>
                    <button type="button" className="note-places-add" disabled={pending}
                            aria-expanded={picker === 'under'} onClick={() => toggle('under')}>Move under another note
                    </button>
                </div>
                {picker === 'out' && <div className="note-places-picker">
                    <ConstellationPicker items={items} label="Move this note to…" action={(name) => `Move to ${name}`}
                                         busy={pending} onCreate={createIn} onClose={() => setPicker(null)}
                                         lead={{
                                             label: 'Leave without a place',
                                             onSelect: () => void run(() => moveNoteOut(noteId, null)),
                                         }}
                                         onPick={(id) => void run(() => moveNoteOut(noteId, id))}/>
                </div>}
                {picker === 'under' && underPicker('Find a note…')}
                {error && <p className="note-places-error" role="alert">{error}</p>}
            </div>
        )
    }

    const moveUnder = <button type="button" className="note-places-add" disabled={pending}
                              aria-expanded={picker === 'under'} onClick={() => toggle('under')}>Move under a note
    </button>

    const pickerBlock = picker === 'add' && <div className="note-places-picker">
        <ConstellationPicker items={items} label="Add this note to…" action={(name) => `Add to ${name}`}
                             busy={pending} onPick={add} onCreate={createIn} onClose={() => setPicker(null)}/>
    </div>

    return (
        <div className="note-places" aria-busy={pending || undefined}>
            {main ? <>
                <div className="note-places-main">
                    <MainPath node={main} disabled={pending || others.length === 0} open={picker === 'main'}
                              onClick={() => toggle('main')}/>
                    <IconButton s={32} title={`Remove from ${main.name}`} disabled={pending}
                                onClick={() => void run(() => removeNoteConstellation(noteId, main.id))}>
                        <Icon name="close" size={11}/>
                    </IconButton>
                </div>
                {picker === 'main' && <div className="note-places-choice" role="list" aria-label="Make main">
                    {others.map((node) => (
                        <div role="listitem" key={node.id}>
                            <button type="button" disabled={pending}
                                    onClick={() => void run(() => setMainNoteConstellation(noteId, node.id, false))}>
                                <TagDot color={constellationColor(node.hue, node.lightness)} size={6}/>
                                <span>{[...node.ancestors.map((ancestor) => ancestor.name), node.name].join(' › ')}</span>
                            </button>
                        </div>
                    ))}
                </div>}
                <div className="note-places-chips">
                    {others.map((node) => (
                        <ConstellationChip key={node.id} label={node.name} size="sm"
                                           color={constellationColor(node.hue, node.lightness)}
                                           onRemove={() => void run(() => removeNoteConstellation(noteId, node.id))}/>
                    ))}
                    <button type="button" className="note-places-add" disabled={pending}
                            aria-expanded={picker === 'add'} onClick={() => toggle('add')}>+ Add constellation
                    </button>
                    {moveUnder}
                </div>
                {picker === 'add' && pickerBlock}
            </> : <>
                <div className="note-places-main">
                    <p className="context-text">Not in a constellation yet.</p>
                    <button type="button" className="note-places-add" disabled={pending}
                            aria-expanded={picker === 'add'} onClick={() => toggle('add')}>+ Add
                    </button>
                </div>
                <div className="note-places-chips">{moveUnder}</div>
                {pickerBlock}
            </>}
            {picker === 'under' && underPicker('Move this note under…')}
            {error && <p className="note-places-error" role="alert">{error}</p>}
        </div>
    )
}

/**
 * The main place as a breadcrumb, leaf in accent; deeper than three levels collapses to `root › … › leaf`. It opens the
 * choice among the note's other places, so it is inactive while there are none.
 */
function MainPath({node, disabled, open, onClick}: {
    node: ConstellationNode
    disabled: boolean
    open: boolean
    onClick: () => void
}) {
    const deep = node.ancestors.length > 2
    const heads = deep ? [node.ancestors[0]] : node.ancestors
    return (
        <button type="button" className="note-places-path" title={disabled ? undefined : 'Choose the main place'}
                disabled={disabled} aria-expanded={disabled ? undefined : open}
                onClick={onClick}>
            <TagDot color={constellationColor(node.hue, node.lightness)} size={8}/>
            {heads.map((ancestor) => <span key={ancestor.id} className="note-places-crumb">{ancestor.name} ›</span>)}
            {deep && <span className="note-places-crumb">… ›</span>}
            <span className="note-places-leaf">{node.name}</span>
        </button>
    )
}

/**
 * A sub-note's place: the main constellation of its top note (if any), then its parent notes as links, then the note
 * itself in accent.
 */
function SubNotePath({main, ancestors, title}: {
    main: ConstellationNode | null
    ancestors: NoteRef[]
    title?: string
}) {
    const constellations = main ? [...main.ancestors, main] : []
    const deep = constellations.length > 2
    const shown = deep ? [constellations[0], constellations[constellations.length - 1]] : constellations
    return (
        <p className="note-places-path note-places-subpath">
            {main && <TagDot color={constellationColor(main.hue, main.lightness)} size={8}/>}
            {shown.map((node, index) => <span key={node.id} className="note-places-crumb">
                {deep && index === 1 && '… › '}{node.name} ›</span>)}
            {ancestors.map((ancestor) => <span key={ancestor.id} className="note-places-crumb">
                <Link to={`/notes/${ancestor.id}`} className="note-places-note">{ancestor.title || 'Untitled note'}</Link> ›
            </span>)}
            <span className="note-places-leaf">{title || 'This note'}</span>
        </p>
    )
}
