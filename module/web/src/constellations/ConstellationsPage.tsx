import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Button, Dialog, EmptyState, TextField} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {listNotesWithoutConstellation, type Note, notifyNotesChanged} from '../notes/noteApi'
import {ContextPanel} from '../ui/ContextPanel'
import {ScreenHeader} from '../ui/ScreenHeader'
import {
    type Constellation,
    ConstellationApiError,
    createConstellation,
    deleteConstellation,
    listConstellations,
    moveConstellation,
    updateConstellation,
} from './constellationApi'
import {ConstellationPanel, type PanelTool} from './ConstellationPanel'
import {
    buildConstellationTree,
    CONSTELLATION_NAME_LIMIT,
    type ConstellationNode,
    normalizeConstellationName,
    plural,
} from './constellationTree'
import {ConstellationTreeView} from './ConstellationTreeView'
import {DeleteConstellationDialog, type DeleteTarget} from './DeleteConstellationDialog'
import {UnplacedPanel} from './UnplacedPanel'
import './constellations.css'

type LoadState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; items: Constellation[]; unplaced: Note[] }

type DialogState =
    | { kind: 'create'; parentId: string | null }
    | { kind: 'rename'; id: string }
    | { kind: 'delete'; id: string }

/** Which change failed: only a name change can break the name rule. */
export type ConstellationChange = 'name' | 'colour' | 'move' | 'delete'

/** The user's message for a failed change; 404 means the branch is gone (another tab), 409 carries the reason. */
export function constellationFailureMessage(error: unknown, change: ConstellationChange, name?: string): string {
    if (error instanceof ConstellationApiError) {
        if (error.code === 'CONSTELLATION_NAME_TAKEN') {
            return name ? `“${name}” is already taken here. Pick another name.` : 'That name is already taken there.'
        }
        if (error.code === 'CONSTELLATION_MOVE_CYCLE') return 'A branch cannot move inside itself.'
        if (error.status === 404) {
            return change === 'delete' ? 'This constellation or the chosen target no longer exists.'
                : 'This constellation no longer exists.'
        }
        if (error.status === 400) {
            return change === 'name'
                ? `Use a name of 1 to ${CONSTELLATION_NAME_LIMIT} characters.`
                : 'The tree changed since it was loaded. Reload the page and try again.'
        }
        if (error.kind === 'transport') return 'The note service is unavailable. Try again.'
    }
    return 'Could not save the change. Try again.'
}

export function ConstellationsPage() {
    const [load, setLoad] = useState<LoadState>({status: 'loading'})
    const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [unplacedOpen, setUnplacedOpen] = useState(false)
    const [tool, setTool] = useState<PanelTool>(null)
    const [dialog, setDialog] = useState<DialogState | null>(null)
    const [draft, setDraft] = useState('')
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const pendingRef = useRef(false)
    const navigate = useNavigate()

    const reload = useCallback(async (signal?: AbortSignal) => {
        try {
            const [items, unplaced] = await Promise.all([listConstellations(signal), listNotesWithoutConstellation(signal)])
            setLoad({status: 'ready', items, unplaced})
        } catch (e) {
            if (e instanceof AuthRequiredError || signal?.aborted) return
            setLoad({status: 'error', message: e instanceof Error ? e.message : String(e)})
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        void reload(controller.signal)
        return () => controller.abort()
    }, [reload])

    const tree = useMemo(() => buildConstellationTree(load.status === 'ready' ? load.items : []), [load])
    const selected = selectedId ? tree.byId.get(selectedId) ?? null : null

    // A branch deleted elsewhere (or moved out of reach) closes its panel.
    useEffect(() => {
        if (load.status === 'ready' && selectedId && !tree.byId.has(selectedId)) setSelectedId(null)
    }, [load.status, selectedId, tree])

    const select = useCallback((id: string) => {
        setSelectedId(id)
        setUnplacedOpen(false)
        setTool(null)
        setError(null)
        const node = tree.byId.get(id)
        // Opening a branch also unfolds it, as in the design.
        if (node && node.children.length > 0) setOpen((current) => new Set(current).add(id))
    }, [tree])

    const closePanel = useCallback(() => {
        setSelectedId(null)
        setUnplacedOpen(false)
        setTool(null)
        setError(null)
    }, [])

    const toggle = useCallback((id: string) => setOpen((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    }), [])

    /** Unfolds the ancestors of [parentId] and the node itself, so a child placed under it is visible. */
    const reveal = (parentId: string | null, items: Constellation[]) => {
        if (!parentId) return
        const byId = new Map(items.map((item) => [item.id, item]))
        setOpen((current) => {
            const next = new Set(current)
            for (let id: string | null = parentId; id; id = byId.get(id)?.parentId ?? null) next.add(id)
            return next
        })
    }

    /** Runs one change at a time; refreshes the tree after it, failures stay in the dialog or the panel. */
    async function run<T>(kind: ConstellationChange, change: () => Promise<T>, name?: string): Promise<T | undefined> {
        if (pendingRef.current) return undefined
        pendingRef.current = true
        setPending(true)
        setError(null)
        try {
            return await change()
        } catch (e) {
            // A 404 keeps the stale tree: reloading would close the panel or dialog together with this message.
            if (!(e instanceof AuthRequiredError)) setError(constellationFailureMessage(e, kind, name))
            return undefined
        } finally {
            pendingRef.current = false
            setPending(false)
        }
    }

    async function refreshAfter(parentId: string | null) {
        const items = await listConstellations().catch(() => null)
        if (items) {
            setLoad((current) => ({status: 'ready', items, unplaced: current.status === 'ready' ? current.unplaced : []}))
            reveal(parentId, items)
        } else {
            await reload()
        }
    }

    function openDialog(next: DialogState, initialDraft = '') {
        setError(null)
        setDraft(initialDraft)
        setDialog(next)
    }

    const closeDialog = useCallback(() => {
        if (pendingRef.current) return
        setDialog(null)
        setError(null)
    }, [])

    async function submitName() {
        if (!dialog || dialog.kind === 'delete') return
        const name = normalizeConstellationName(draft)
        if (name === null) return
        const saved = await run('name', () => dialog.kind === 'create'
            ? createConstellation(name, dialog.parentId)
            : updateConstellation(dialog.id, {name}), name)
        if (!saved) return
        await refreshAfter(saved.parentId)
        setDialog(null)
        if (dialog.kind === 'create') {
            setSelectedId(saved.id)
            setTool(null)
        }
    }

    async function submitDelete(target: DeleteTarget | null) {
        if (dialog?.kind !== 'delete') return
        const id = dialog.id
        const done = await run('delete', async () => {
            await deleteConstellation(id, target && target !== 'none' ? target : null)
            return true
        })
        if (!done) return
        setDialog(null)
        if (selectedId === id) closePanel()
        await reload()
        // Notes moved or lost their place: open "Notes here" lists re-read them.
        if (target) notifyNotesChanged()
    }

    async function recolor(node: ConstellationNode, change: { hue: number } | { lightness: Constellation['lightness'] }) {
        const saved = await run('colour', () => updateConstellation(node.id, change))
        if (!saved) return
        await refreshAfter(null)
        setTool(null)
    }

    async function move(node: ConstellationNode, parentId: string | null) {
        const saved = await run('move', () => moveConstellation(node.id, parentId), node.name)
        if (!saved) return
        await refreshAfter(saved.parentId)
        setTool(null)
    }

    const unplaced = load.status === 'ready' ? load.unplaced : []
    const unplacedRow = unplaced.length > 0
        ? {
            count: unplaced.length, selected: unplacedOpen, onSelect: () => {
                setSelectedId(null)
                setTool(null)
                setError(null)
                setUnplacedOpen(true)
            },
        }
        : undefined
    const openNote = (noteId: string) => navigate(`/notes/${noteId}`)
    const count = load.status === 'ready' ? `${plural(tree.roots.length, 'root', 'roots')} · ${tree.flat.length} in all` : undefined
    const dialogNode = dialog && dialog.kind !== 'create' ? tree.byId.get(dialog.id) ?? null : null
    const createParent = dialog?.kind === 'create' && dialog.parentId ? tree.byId.get(dialog.parentId) ?? null : null

    return <div className="detail-layout">
        <div className="product-view constellations-view">
            <ScreenHeader kicker="Constellations" count={count}/>
            <div className="product-body">
                {load.status === 'loading' && <p className="constellations-state">Loading…</p>}
                {load.status === 'error' && <div className="constellations-state" role="alert">
                    <p>Could not load the constellations. {load.message}</p>
                    <Button size="sm" variant="quiet" onClick={() => {
                        setLoad({status: 'loading'})
                        void reload()
                    }}>Retry</Button>
                </div>}
                {load.status === 'ready' && tree.flat.length === 0 && <div className="product-empty">
                    <EmptyState title="No constellations yet"
                                body="Constellations are the places your notes live: roots like Music or Films, with branches under them as deep as you like."
                                action="New constellation" onAction={() => openDialog({kind: 'create', parentId: null})}/>
                    {unplacedRow && <ConstellationTreeView tree={tree} open={open} selectedId={null} onToggle={toggle}
                                                           onSelect={select} unplaced={unplacedRow}/>}
                </div>}
                {load.status === 'ready' && tree.flat.length > 0 && <div className="constellations-body">
                    <ConstellationTreeView tree={tree} open={open} selectedId={selectedId} onToggle={toggle}
                                           onSelect={select} unplaced={unplacedRow}/>
                    <div className="constellations-foot">
                        <button type="button" className="constellations-new"
                                onClick={() => openDialog({kind: 'create', parentId: null})}>+ New constellation
                        </button>
                        <p>You choose where each note lives. Colour comes from the root; the branches below it play
                            with lightness.</p>
                    </div>
                </div>}
            </div>
        </div>
        {selected && <ContextPanel label={selected.depth === 0 ? 'Constellation' : 'Sub-constellation'} open
                                   onClose={closePanel}>
            <ConstellationPanel node={selected} tree={tree} tool={tool} busy={pending}
                                error={dialog ? null : error}
                                onTool={(next) => {
                                    setTool(next)
                                    setError(null)
                                }}
                                onRename={() => openDialog({kind: 'rename', id: selected.id}, selected.name)}
                                onCreateChild={() => openDialog({kind: 'create', parentId: selected.id})}
                                onDelete={() => openDialog({kind: 'delete', id: selected.id})}
                                onRecolor={(change) => void recolor(selected, change)}
                                onMove={(parentId) => void move(selected, parentId)}
                                onOpenNote={openNote}/>
        </ContextPanel>}
        {unplacedOpen && !selected && <ContextPanel label="Without constellation" open onClose={closePanel}>
            <UnplacedPanel count={unplaced.length} onOpenNote={openNote}/>
        </ContextPanel>}
        {dialog && dialog.kind !== 'delete' && <Dialog
            title={dialog.kind === 'rename' ? 'Rename constellation'
                : createParent ? `New sub-constellation in ${createParent.name}` : 'New constellation'}
            body={error ?? undefined}
            confirm={pending ? 'Saving…' : dialog.kind === 'rename' ? 'Save' : 'Create'} cancel="Cancel"
            busy={pending} confirmDisabled={pending || normalizeConstellationName(draft) === null}
            onConfirm={() => void submitName()} onCancel={closeDialog} width={320}>
            <TextField label="Name" value={draft} maxLength={CONSTELLATION_NAME_LIMIT} autoFocus
                       onChange={(event) => setDraft(event.target.value)}
                       onKeyDown={(event) => {
                           if (event.key === 'Enter') void submitName()
                       }}/>
        </Dialog>}
        {dialog?.kind === 'delete' && dialogNode && <DeleteConstellationDialog
            node={dialogNode} tree={tree} busy={pending} error={error}
            onDelete={(target) => void submitDelete(target)} onCancel={closeDialog}/>}
    </div>
}
