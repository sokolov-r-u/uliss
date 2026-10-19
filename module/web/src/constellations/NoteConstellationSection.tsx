import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
    Button,
    ConstellationChip,
    ConstellationPicker,
    constellationColor,
    Icon,
    IconButton,
    Kicker,
    TagDot,
} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {
    addNoteConstellation,
    type Constellation,
    ConstellationApiError,
    createConstellation,
    listConstellations,
    listNoteConstellations,
    type NoteMembership,
    removeNoteConstellation,
    setMainNoteConstellation,
} from './constellationApi'
import {buildConstellationTree, type ConstellationNode, type ConstellationTree, pickerItems} from './constellationTree'
import './note-constellation.css'

type Picker = 'change' | 'add' | null

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; items: Constellation[]; tree: ConstellationTree; memberships: NoteMembership[] }

/** The user's message for a failed change of the note's places. */
export function placementFailureMessage(error: unknown, name?: string): string {
    if (error instanceof ConstellationApiError) {
        if (error.code === 'CONSTELLATION_NAME_TAKEN') return `“${name}” is already taken. Pick it from the list.`
        if (error.code === 'NOTE_PLACE_INHERITED') return 'This note lives where its parent note lives.'
        if (error.status === 404) return 'This note or constellation no longer exists. Reload the page.'
        if (error.status === 400 && name !== undefined) return 'Use a name of 1 to 40 characters.'
        if (error.kind === 'transport') return 'The note service is unavailable. Try again.'
    }
    return 'Could not save the change. Try again.'
}

/**
 * The "Constellation" section of a note's panel: the main place as a path with Change and ×, the other places as chips
 * (click makes one main, × removes it) and "+ Add constellation". Every pick goes through the shared tree picker, which
 * can also create a constellation where the user stands; the picker's action button places the note.
 */
export function NoteConstellationSection({noteId}: { noteId: string }) {
    const [load, setLoad] = useState<LoadState>({status: 'loading'})
    const [picker, setPicker] = useState<Picker>(null)
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const pendingRef = useRef(false)

    const reload = useCallback(async (signal?: AbortSignal) => {
        try {
            const [items, memberships] = await Promise.all([
                listConstellations(signal),
                listNoteConstellations(noteId, signal),
            ])
            setLoad({status: 'ready', items, tree: buildConstellationTree(items), memberships})
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

    /** Runs one change at a time; the service answers with the note's new places. */
    async function run(change: () => Promise<NoteMembership[]>) {
        if (pendingRef.current) return
        pendingRef.current = true
        setPending(true)
        setError(null)
        try {
            const memberships = await change()
            setLoad((current) => current.status === 'ready' ? {...current, memberships} : current)
            setPicker(null)
        } catch (e) {
            if (!(e instanceof AuthRequiredError)) setError(placementFailureMessage(e))
        } finally {
            pendingRef.current = false
            setPending(false)
        }
    }

    function place(mode: Exclude<Picker, null>, constellationId: string) {
        if (load.status !== 'ready') return
        // A pick that changes nothing says so instead of closing the picker as if it worked.
        const current = load.memberships.find((membership) => membership.constellationId === constellationId)
        const name = load.tree.byId.get(constellationId)?.name
        if (current && (mode === 'add' || current.main)) {
            setError(current.main ? `${name} is already the main place.` : `The note is already in ${name}.`)
            return
        }
        void run(() => mode === 'change'
            ? setMainNoteConstellation(noteId, constellationId, true)
            : addNoteConstellation(noteId, constellationId))
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

    const {tree, memberships} = load
    // A place deleted meanwhile in another tab is left out until the next load.
    const placed = memberships
        .map((membership) => ({membership, node: tree.byId.get(membership.constellationId)}))
        .filter((item): item is { membership: NoteMembership; node: ConstellationNode } => item.node != null)
    const main = placed.find((item) => item.membership.main)?.node ?? null
    const others = placed.filter((item) => !item.membership.main).map((item) => item.node)
    const toggle = (next: Exclude<Picker, null>) => {
        setError(null)
        setPicker((current) => current === next ? null : next)
    }

    const pickerBlock = picker && <div className="note-places-picker">
        <ConstellationPicker key={picker} items={items}
                             label={picker === 'change' ? 'Move this note to…' : 'Add this note to…'}
                             action={(name) => picker === 'change' ? `Make ${name} main` : `Add to ${name}`}
                             busy={pending}
                             onPick={(id) => place(picker, id)}
                             onCreate={createIn}
                             onClose={() => setPicker(null)}/>
    </div>

    return (
        <div className="note-places" aria-busy={pending || undefined}>
            {main ? <>
                <div className="note-places-main">
                    <MainPath node={main} disabled={pending} onClick={() => toggle('change')}/>
                    <button type="button" className="note-places-action accent" disabled={pending}
                            aria-expanded={picker === 'change'} onClick={() => toggle('change')}>Change
                    </button>
                    <IconButton s={32} title={`Remove from ${main.name}`} disabled={pending}
                                onClick={() => void run(() => removeNoteConstellation(noteId, main.id))}>
                        <Icon name="close" size={11}/>
                    </IconButton>
                </div>
                {picker === 'change' && pickerBlock}
                <div className="note-places-also">
                    {others.length > 0 && <Kicker size={8.5} spacing="2.2px" color="var(--text-faint)">Also in</Kicker>}
                    <div className="note-places-chips">
                        {others.map((node) => (
                            <ConstellationChip key={node.id} label={node.name} size="sm"
                                               color={constellationColor(node.hue, node.lightness)}
                                               actionTitle={`Make ${node.name} main`}
                                               onClick={() => void run(() => setMainNoteConstellation(noteId, node.id, false))}
                                               onRemove={() => void run(() => removeNoteConstellation(noteId, node.id))}/>
                        ))}
                        <button type="button" className="note-places-add" disabled={pending}
                                aria-expanded={picker === 'add'} onClick={() => toggle('add')}>+ Add constellation
                        </button>
                    </div>
                </div>
                {picker === 'add' && pickerBlock}
            </> : <>
                <div className="note-places-main">
                    <p className="context-text">Not in a constellation yet.</p>
                    <button type="button" className="note-places-add" disabled={pending}
                            aria-expanded={picker === 'add'} onClick={() => toggle('add')}>+ Add
                    </button>
                </div>
                {pickerBlock}
            </>}
            {error && <p className="note-places-error" role="alert">{error}</p>}
        </div>
    )
}

/** The main place as a breadcrumb, leaf in accent; deeper than three levels collapses to `root › … › leaf`. */
function MainPath({node, disabled, onClick}: { node: ConstellationNode; disabled: boolean; onClick: () => void }) {
    const deep = node.ancestors.length > 2
    const heads = deep ? [node.ancestors[0]] : node.ancestors
    return (
        <button type="button" className="note-places-path" title="Change constellation" disabled={disabled}
                onClick={onClick}>
            <TagDot color={constellationColor(node.hue, node.lightness)} size={8}/>
            {heads.map((ancestor) => <span key={ancestor.id} className="note-places-crumb">{ancestor.name} ›</span>)}
            {deep && <span className="note-places-crumb">… ›</span>}
            <span className="note-places-leaf">{node.name}</span>
        </button>
    )
}
