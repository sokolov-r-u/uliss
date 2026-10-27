import {Fragment, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Link} from 'react-router-dom'
import {
    Button,
    ConstellationPicker,
    constellationColor,
    Dialog,
    Icon,
    noteTitleText,
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
    removeNoteConstellation,
    setMainNoteConstellation,
} from './constellationApi'
import {buildConstellationTree, type ConstellationTree, pickerItems} from './constellationTree'
import {
    type PlaceChange,
    type PlaceConfirmation,
    type PlacedNode,
    placePath,
    quotedNote,
    segmentsOf,
    subCross,
    subOut,
    topCross,
    topMoveTo,
    topUnder,
} from './notePlaceMoves'
import {notifyNotesChanged} from '../notes/noteApi'
import {useSkyNotes} from './useSkyNotes'
import './note-constellation.css'

/** The longest failure message: the dialog reserves its height, so an error never resizes it. */
const LONGEST_FAILURE = 'This note or constellation no longer exists. Reload the page.'

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
 * The "Constellation" section of a note's panel. Every place is a path row from the root with a cross on each segment,
 * the main one marked; a click on another row makes it main. A cross moves the note to the segment before it — off the
 * root it leaves that place — after a dialog that names the target and what is lost. A sub-note shows one row: its top
 * note's main line, then its parent notes, then itself; a cross there moves it under the note before it or out of its
 * parent along that line. "Add to…" opens the tree picker: a top note joins a constellation (asking only when a place
 * on the same line gives way) or goes under a note; a sub-note moves out into a constellation. `onChanged` hears every
 * stored change of the note's place or of the tree (a new constellation), for hosts that draw them (the sky).
 */
export function NoteConstellationSection({noteId, noteTitle, noteIcon, onChanged}: {
    noteId: string
    noteTitle?: string
    noteIcon?: string
    onChanged?: () => void
}) {
    const [load, setLoad] = useState<LoadState>({status: 'loading'})
    const [picking, setPicking] = useState(false)
    const [confirmation, setConfirmation] = useState<PlaceConfirmation | null>(null)
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dialogError, setDialogError] = useState<string | null>(null)
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
        setPicking(false)
        setConfirmation(null)
        setError(null)
        void reload(controller.signal)
        return () => controller.abort()
    }, [reload])

    /**
     * Runs one change at a time; the service answers with the note's new places, or with its whole new place after a
     * move under or out from under a note, which also changes the sub-note lists. A failure shows in the open dialog,
     * or under the section without one.
     */
    async function run(change: () => Promise<NoteMembership[] | NotePlace>, inDialog = false) {
        if (pendingRef.current) return
        pendingRef.current = true
        setPending(true)
        setError(null)
        setDialogError(null)
        try {
            const result = await change()
            const place: (current: NotePlace) => NotePlace = Array.isArray(result)
                ? (current) => ({...current, constellations: result})
                : () => result
            setLoad((current) => current.status === 'ready' ? {...current, place: place(current.place)} : current)
            if (!Array.isArray(result)) notifyNotesChanged()
            onChanged?.()
            setPicking(false)
            setConfirmation(null)
        } catch (e) {
            if (!(e instanceof AuthRequiredError)) (inDialog ? setDialogError : setError)(placementFailureMessage(e))
        } finally {
            pendingRef.current = false
            setPending(false)
        }
    }

    function apply(change: PlaceChange, inDialog = false) {
        void run(() => {
            switch (change.kind) {
                case 'add':
                    return addNoteConstellation(noteId, change.constellationId)
                case 'remove':
                    return removeNoteConstellation(noteId, change.constellationId)
                case 'under':
                    return moveNoteUnder(noteId, change.parentNoteId)
                case 'out':
                    return moveNoteOut(noteId, change.moveTo)
            }
        }, inDialog)
    }

    function ask(next: PlaceConfirmation | null, orElse?: () => void) {
        setError(null)
        setDialogError(null)
        if (next) setConfirmation(next)
        else orElse?.()
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
            onChanged?.()
            return created.id
        } catch (e) {
            if (!(e instanceof AuthRequiredError)) setError(placementFailureMessage(e, name))
            throw e
        }
    }

    const isSubNote = load.status === 'ready' && load.place.ancestors.length > 0
    const items = useMemo(() => load.status === 'ready' ? pickerItems(load.tree) : [], [load])
    // A sub-note's picker offers constellations only.
    const skyNotes = useSkyNotes(picking && load.status === 'ready' && !isSubNote)

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

    const {place, tree} = load
    // A place deleted meanwhile in another tab is left out until the next load.
    const placed: PlacedNode[] = place.constellations.flatMap((membership) => {
        const node = tree.byId.get(membership.constellationId)
        return node ? [{node, main: membership.main}] : []
    })

    function pickConstellation(id: string) {
        const target = tree.byId.get(id)
        if (!target) return
        if (isSubNote) {
            ask(subOut(place.ancestors, placed, target))
            return
        }
        // A pick that changes nothing says so instead of closing the picker as if it worked.
        if (placed.some((item) => item.node.id === id)) {
            setError(`The note is already in ${placePath(target)}.`)
            return
        }
        ask(topMoveTo(placed, target), () => apply({kind: 'add', constellationId: id}))
    }

    function pickNote(id: string) {
        if (skyNotes?.status !== 'ready') return
        const note = skyNotes.items.find((item) => item.id === id)
        if (note) ask(topUnder(placed, {id, title: note.title, icon: note.icon ?? undefined}))
    }

    const picker = picking && <div className="note-places-picker">
        {isSubNote
            ? <ConstellationPicker items={items} label="Move this note to…" action={(name) => `Move to ${name}`}
                                   busy={pending} onPick={pickConstellation} onCreate={createIn}
                                   onClose={() => setPicking(false)}/>
            : skyNotes?.status === 'ready'
                ? <ConstellationPicker items={items} label="Add this note to…" action={(name) => `Add to ${name}`}
                                       busy={pending} exclude={[noteId]} onPick={pickConstellation} onCreate={createIn}
                                       onClose={() => setPicking(false)}
                                       notes={{
                                           items: skyNotes.items,
                                           action: (title) => `Move under ${title}`,
                                           onPick: pickNote,
                                       }}/>
                : skyNotes?.status === 'error'
                    ? <div className="note-places-state">
                        <p className="context-text">Could not load the notes.</p>
                        <Button size="sm" variant="quiet" onClick={skyNotes.retry}>Retry</Button>
                    </div>
                    : <p className="context-text">Loading the notes…</p>}
    </div>

    const main = placed.find((item) => item.main)?.node ?? null
    return (
        <div className="note-places" aria-busy={pending || undefined}>
            {isSubNote
                ? <SubNotePath main={main} ancestors={place.ancestors} disabled={pending}
                               title={noteTitle ? noteTitleText(noteTitle, noteIcon) : undefined}
                               onCross={(index) => ask(subCross(place.ancestors, placed, index))}/>
                : placed.length > 0
                    ? placed.map((item) => (
                        <PlacePath key={item.node.id} place={item} marked={placed.length > 1} disabled={pending}
                                   onMain={() => void run(() => setMainNoteConstellation(noteId, item.node.id, false))}
                                   onCross={(index) => ask(topCross(placed, item, index))}/>
                    ))
                    : <p className="context-text">Not in a constellation yet.</p>}
            <button type="button" className="note-places-add" disabled={pending} aria-expanded={picking}
                    onClick={() => {
                        setError(null)
                        setPicking((open) => !open)
                    }}>Add to…
            </button>
            {picker}
            {error && <p className="note-places-error" role="alert">{error}</p>}
            {confirmation && <Dialog title={confirmation.title} width={340} busy={pending}
                                     confirm={pending ? 'Moving…' : confirmation.confirm} cancel="Cancel"
                                     confirmDisabled={pending}
                                     onConfirm={() => apply(confirmation.change, true)}
                                     onCancel={() => {
                                         if (!pendingRef.current) setConfirmation(null)
                                     }}>
                {/* Body, error and the longest error share one cell: the dialog keeps its height. */}
                <div className="note-places-confirm">
                    <span aria-hidden={dialogError ? true : undefined}
                          style={dialogError ? {visibility: 'hidden'} : undefined}>{confirmation.body}</span>
                    <span aria-hidden="true" style={{visibility: 'hidden'}}>{LONGEST_FAILURE}</span>
                    {dialogError && <span className="note-places-confirm-error" role="alert">{dialogError}</span>}
                </div>
            </Dialog>}
        </div>
    )
}

/** A cross on one segment of a path: it moves the note to the segment before it. */
function Cross({name, disabled, onClick}: { name: string; disabled: boolean; onClick: () => void }) {
    return <button type="button" className="note-places-cross" title={`Out of ${name}`} aria-label={`Out of ${name}`}
                   disabled={disabled} onClick={onClick}>
        <Icon name="close" size={8}/>
    </button>
}

/**
 * A top note's place as a full path, leaf in accent, a cross on each segment. With several places the main one is
 * marked and a click on a segment name of another row makes that row main.
 */
function PlacePath({place, marked, disabled, onMain, onCross}: {
    place: PlacedNode
    marked: boolean
    disabled: boolean
    onMain: () => void
    onCross: (index: number) => void
}) {
    const segments = segmentsOf(place.node)
    const choosable = marked && !place.main
    return (
        <div className="note-places-path" role="group" aria-label={placePath(place.node)}>
            <TagDot color={constellationColor(place.node.hue, place.node.lightness)} size={8}/>
            {segments.map((node, index) => (
                <Fragment key={node.id}>
                    {index > 0 && <span className="note-places-sep" aria-hidden="true">/</span>}
                    <span className="note-places-segment">
                        {choosable
                            ? <button type="button" className="note-places-name" title="Make this place main"
                                      disabled={disabled} onClick={onMain}>{node.name}</button>
                            : <span className={index === segments.length - 1
                                ? 'note-places-name note-places-leaf' : 'note-places-name'}>{node.name}</span>}
                        <Cross name={node.name} disabled={disabled} onClick={() => onCross(index)}/>
                    </span>
                </Fragment>
            ))}
            {marked && place.main && <span className="note-places-mark">Main</span>}
        </div>
    )
}

/**
 * A sub-note's place: the main line of its top note (if any), then its parent notes as links, each with a cross, then
 * the note itself in accent.
 */
function SubNotePath({main, ancestors, title, disabled, onCross}: {
    main: PlacedNode['node'] | null
    ancestors: NotePlace['ancestors']
    title?: string
    disabled: boolean
    onCross: (index: number) => void
}) {
    const constellations = main ? segmentsOf(main) : []
    return (
        <div className="note-places-path" role="group" aria-label="Place">
            {main && <TagDot color={constellationColor(main.hue, main.lightness)} size={8}/>}
            {constellations.map((node, index) => (
                <Fragment key={node.id}>
                    {index > 0 && <span className="note-places-sep" aria-hidden="true">/</span>}
                    <span className="note-places-segment">
                        <span className="note-places-name">{node.name}</span>
                        <Cross name={node.name} disabled={disabled} onClick={() => onCross(index)}/>
                    </span>
                </Fragment>
            ))}
            {ancestors.map((ancestor, index) => (
                <Fragment key={ancestor.id}>
                    {(main || index > 0) && <span className="note-places-sep" aria-hidden="true">/</span>}
                    <span className="note-places-segment">
                        <Link to={`/notes/${ancestor.id}`} className="note-places-name note-places-note">
                            {noteTitleText(ancestor.title || 'Untitled note', ancestor.icon)}</Link>
                        <Cross name={quotedNote(ancestor)} disabled={disabled}
                               onClick={() => onCross(constellations.length + index)}/>
                    </span>
                </Fragment>
            ))}
            <span className="note-places-sep" aria-hidden="true">/</span>
            <span className="note-places-name note-places-leaf">{title || 'This note'}</span>
        </div>
    )
}
