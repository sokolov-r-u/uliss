import type {ConstellationTree} from '../constellations/constellationTree'

/** The URL parameter of the Notes page that holds one filter constellation; repeated for several. */
export const FILTER_PARAM = 'constellation'

/** As many constellations as the note service filters by in one request. */
export const FILTER_LIMIT = 50

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The filter as the page can send it: values that are uuids, each once, the first [FILTER_LIMIT] of them. A URL
 * edited by hand never reaches the service as a request it rejects.
 */
export function readFilter(params: URLSearchParams): string[] {
    const ids: string[] = []
    for (const raw of params.getAll(FILTER_PARAM)) {
        const id = raw.toLowerCase()
        if (UUID.test(id) && !ids.includes(id) && ids.length < FILTER_LIMIT) ids.push(id)
    }
    return ids
}

/** [params] with the filter replaced by [ids]; other parameters stay. */
export function withFilter(params: URLSearchParams, ids: readonly string[]): URLSearchParams {
    const next = new URLSearchParams(params)
    next.delete(FILTER_PARAM)
    ids.forEach((id) => next.append(FILTER_PARAM, id))
    return next
}

/** Adds [id]; the constellations under it leave the filter, since it already lists their notes. */
export function addToFilter(ids: readonly string[], id: string, tree: ConstellationTree): string[] {
    if (ids.includes(id)) return [...ids]
    const inside = (other: string) => tree.byId.get(other)?.ancestors.some((ancestor) => ancestor.id === id) ?? false
    return [...ids.filter((other) => !inside(other)), id]
}

/** Drops the ids the loaded tree does not have: a constellation deleted meanwhile, or not the user's. */
export function knownFilter(ids: readonly string[], tree: ConstellationTree): string[] {
    return ids.filter((id) => tree.byId.has(id))
}
