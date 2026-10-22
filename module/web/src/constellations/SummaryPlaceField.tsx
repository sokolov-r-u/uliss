import {useCallback, useEffect, useMemo, useState} from 'react'
import {Button, ConstellationPicker, PlaceField} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {
    ConstellationApiError,
    createConstellation,
    getSky,
    listConstellations,
    type Sky,
    type SkyStar,
} from './constellationApi'
import {buildConstellationTree, type ConstellationTree, pickerItems, pickerNotes} from './constellationTree'
import {placementFailureMessage} from './NoteConstellationSection'
import './summary-place.css'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; sky: Sky }

/** Where a new summary note goes: a constellation as its main place, or a note as its parent. */
export type SummaryPlace = { constellationId: string } | { parentNoteId: string }

/** The place as the user reads it: the constellation path, then the parent notes down to the picked one. */
function placePath(place: SummaryPlace, sky: Sky, tree: ConstellationTree): string | null {
    const nodePath = (id: string | undefined) => {
        const node = id ? tree.byId.get(id) : undefined
        return node ? [...node.ancestors.map((ancestor) => ancestor.name), node.name] : []
    }
    if ('constellationId' in place) {
        const path = nodePath(place.constellationId)
        return path.length > 0 ? path.join(' › ') : null
    }
    const stars = new Map(sky.notes.map((star) => [star.id, star]))
    const chain: SkyStar[] = []
    // a cycle in bad data stops instead of hanging
    for (let star = stars.get(place.parentNoteId); star && !chain.includes(star); star = stars.get(star.parentNoteId ?? '')) {
        chain.unshift(star)
    }
    if (chain.length === 0) return null
    return [...nodePath(chain[0]?.memberships[0]?.constellationId), ...chain.map((star) => star.title)].join(' › ')
}

/**
 * The place of a chat's first summary note as one collapsed line: it unfolds the shared tree picker with every
 * constellation and note (from the sky), which can also create a constellation where the user stands. An empty place
 * is a note without a constellation. A new [revision] reloads the tree (a picked place was deleted); failures go to
 * [onError], the dialog's message block.
 */
export function SummaryPlaceField({place, onChange, disabled, revision, onError}: {
    place: SummaryPlace | null
    onChange: (place: SummaryPlace | null) => void
    disabled: boolean
    revision: number
    onError: (message: string | null) => void
}) {
    const [load, setLoad] = useState<LoadState>({status: 'loading'})

    const reload = useCallback(async (signal?: AbortSignal) => {
        try {
            setLoad({status: 'ready', sky: await getSky(signal)})
        } catch (e) {
            if (e instanceof AuthRequiredError || signal?.aborted) return
            setLoad({status: 'error'})
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        void reload(controller.signal)
        return () => controller.abort()
    }, [reload, revision])

    /** Creates a constellation for the picker, which then selects it; the place is set only by the picker's action. */
    async function createIn(name: string, parentId: string | null): Promise<string | undefined> {
        onError(null)
        try {
            const created = await createConstellation(name, parentId)
            const fresh = await listConstellations().catch(() => null)
            setLoad((current) => current.status === 'ready'
                ? {status: 'ready', sky: {...current.sky, constellations: fresh ?? [...current.sky.constellations, created]}}
                : current)
            return created.id
        } catch (e) {
            if (e instanceof ConstellationApiError && e.status === 404) {
                // The branch to create in was deleted elsewhere: there is no note yet, so say so and refresh the tree.
                onError('That constellation no longer exists. Pick another place.')
                void reload()
            } else if (!(e instanceof AuthRequiredError)) {
                onError(placementFailureMessage(e, name))
            }
            throw e
        }
    }

    const sky = load.status === 'ready' ? load.sky : null
    const tree = useMemo(() => sky ? buildConstellationTree(sky.constellations) : null, [sky])
    const items = useMemo(() => tree ? pickerItems(tree) : [], [tree])
    const notes = useMemo(() => sky ? pickerNotes(sky.notes) : [], [sky])
    const path = place && sky && tree ? placePath(place, sky, tree) : null
    // a place gone from a fresh tree is emptied, so the line never hides a stale choice
    const gone = place != null && sky != null && path == null
    useEffect(() => {
        if (gone) onChange(null)
    }, [gone, onChange])

    const choose = (next: SummaryPlace, close: () => void) => {
        onError(null)
        onChange(next)
        close()
    }

    return <PlaceField label="Place" placeholder="Choose a place" value={path} disabled={disabled}
                       onClear={() => onChange(null)}>
        {(close) => load.status === 'ready'
            ? <ConstellationPicker items={items} label="Find a place…" action={(name) => `Put in ${name}`}
                                   busy={disabled} onCreate={createIn} onClose={close}
                                   onPick={(id) => choose({constellationId: id}, close)}
                                   notes={{
                                       items: notes,
                                       action: (title) => `Put under ${title}`,
                                       onPick: (id) => choose({parentNoteId: id}, close),
                                   }}/>
            : <div className="summary-place-state">
                {load.status === 'loading'
                    ? <p className="context-text">Loading the constellations…</p>
                    : <>
                        <p className="context-text">Could not load the constellations.</p>
                        <Button size="sm" variant="quiet" onClick={() => {
                            setLoad({status: 'loading'})
                            void reload()
                        }}>Retry</Button>
                    </>}
            </div>}
    </PlaceField>
}
