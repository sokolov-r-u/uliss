import {useCallback, useEffect, useMemo, useState} from 'react'
import type {ConstellationPickerItem, ConstellationPickerNoteItem} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {ConstellationApiError, createConstellation, getSky, listConstellations, type Sky, type SkyStar} from './constellationApi'
import {buildConstellationTree, type ConstellationTree, pickerItems, pickerNotes} from './constellationTree'
import {placementFailureMessage} from './NoteConstellationSection'

/** Where a new summary note goes: a constellation as its main place, or a note as its parent. */
export type SummaryPlace = { constellationId: string } | { parentNoteId: string }

export type SummaryPlacesLoad = { status: 'loading' } | { status: 'error' } | { status: 'ready'; sky: Sky }

export interface SummaryPlaces {
    load: SummaryPlacesLoad
    reload: () => void
    items: ConstellationPickerItem[]
    notes: ConstellationPickerNoteItem[]
    /** The place as the user reads it; null while the tree is not loaded or the place is gone from it. */
    pathOf: (place: SummaryPlace) => string | null
    /** Creates a constellation for the picker and resolves to its id; failures go to `onError` and reject. */
    createIn: (name: string, parentId: string | null) => Promise<string | undefined>
}

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
 * Every constellation and note a new summary note can go to, read from the sky while [enabled]; a new [revision]
 * reads it again (a picked place was deleted).
 */
export function useSummaryPlaces(enabled: boolean, revision: number, onError: (message: string | null) => void):
    SummaryPlaces {
    const [load, setLoad] = useState<SummaryPlacesLoad>({status: 'loading'})

    const read = useCallback(async (signal?: AbortSignal) => {
        try {
            setLoad({status: 'ready', sky: await getSky(signal)})
        } catch (e) {
            if (e instanceof AuthRequiredError || signal?.aborted) return
            setLoad({status: 'error'})
        }
    }, [])

    useEffect(() => {
        if (!enabled) return
        const controller = new AbortController()
        setLoad({status: 'loading'})
        void read(controller.signal)
        return () => controller.abort()
    }, [enabled, read, revision])

    const reload = useCallback(() => {
        setLoad({status: 'loading'})
        void read()
    }, [read])

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
                void read()
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
    const pathOf = useCallback((place: SummaryPlace) => sky && tree ? placePath(place, sky, tree) : null, [sky, tree])

    return {load, reload, items, notes, pathOf, createIn}
}
