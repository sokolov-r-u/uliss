/**
 * In-memory note-service constellation tree for the harness (`visual/fakeApi.ts`). Keeps the service's rules that a
 * user can see: names unique among siblings regardless of case, palette tone for a new root, lightness by depth,
 * colour rules of a move, no moves into the own branch, branch delete; and the note places: first place main, one
 * place per line, a lost main passes to the oldest place, distinct subtree counts, notes moved on a branch delete.
 */
import {CONSTELLATIONS, type StoredConstellation} from './fixtures'

interface Place {
    id: string
    main: boolean
    /** Joining order, the fake's `added_at`. */
    at: number
}

const PALETTE = [22, 42, 70, 88, 112, 152, 176, 200, 232, 264, 292, 316, 348]

/** [subtreeOf] gives a note with all its sub-notes, which live where it lives and count with it. */
export function createConstellationStore(empty: boolean, subtreeOf: (noteId: string) => string[] = (id) => [id]) {
    const rows: StoredConstellation[] = empty ? [] : CONSTELLATIONS.map((row) => ({...row}))
    let sequence = 0
    let clock = 0
    /** Note id → its places, as the service stores them. */
    const places = new Map<string, Place[]>()

    const find = (id: string | null) => rows.find((row) => row.id === id)
    const path = (row: StoredConstellation): StoredConstellation[] => {
        const parent = find(row.parentId)
        return parent ? [...path(parent), row] : [row]
    }
    const view = (row: StoredConstellation) => ({
        id: row.id,
        parentId: row.parentId,
        name: row.name,
        hue: path(row)[0].hue,
        lightness: row.lightness ?? 'BASE',
        noteCount: notesUnder(row.id).size,
        ownNoteCount: notesOf(row.id).length,
    })
    const branchOf = (rootId: string): string[] =>
        [rootId, ...rows.filter((row) => row.parentId === rootId).flatMap((row) => branchOf(row.id))]
    const notesOf = (id: string) => [...places].filter(([, list]) => list.some((place) => place.id === id))
        .flatMap(([noteId]) => subtreeOf(noteId))
    const notesUnder = (id: string) => new Set(branchOf(id).flatMap(notesOf))
    const isAncestor = (above: string, below: string) => {
        const row = find(below)
        return above !== below && row != null && path(row).some((item) => item.id === above)
    }
    const ordered = (list: Place[]) => [...list].sort((a, b) => Number(b.main) - Number(a.main) || a.at - b.at)
    const withMain = (list: Place[]) => {
        if (list.length === 0 || list.some((place) => place.main)) return ordered(list)
        const oldest = [...list].sort((a, b) => a.at - b.at)[0]
        return ordered(list.map((place) => place === oldest ? {...place, main: true} : place))
    }
    const answerPlaces = (noteId: string) => ({
        status: 200,
        body: ordered(places.get(noteId) ?? []).map((place) => ({constellationId: place.id, main: place.main})),
    })
    const store = (noteId: string, list: Place[]) => {
        if (list.length === 0) places.delete(noteId)
        else places.set(noteId, list)
        return answerPlaces(noteId)
    }
    const taken = (parentId: string | null, name: string, exceptId?: string) =>
        rows.some((row) => row.parentId === parentId && row.id !== exceptId && row.name.toLowerCase() === name.toLowerCase())
    const lightnessAt = (depth: number) => (depth === 1 ? 'LIGHT' : 'PALE') as StoredConstellation['lightness']
    const refusal = (status: number, code?: string) => ({status, body: code ? {code} : {}})

    return {
        list: () => ({status: 200, body: rows.map(view)}),

        create(body: { name: string; parentId: string | null }) {
            const name = body.name.trim().replace(/\s+/g, ' ')
            if (!name || [...name].length > 40) return refusal(400)
            const parent = body.parentId ? find(body.parentId) : null
            if (body.parentId && !parent) return refusal(404)
            if (taken(body.parentId, name)) return refusal(409, 'CONSTELLATION_NAME_TAKEN')
            const uses = (tone: number) => rows.filter((row) => row.parentId === null && row.hue === tone).length
            const row: StoredConstellation = {
                id: `k-new-${++sequence}`,
                parentId: parent?.id ?? null,
                name,
                hue: parent ? null : PALETTE.reduce((best, tone) => (uses(tone) < uses(best) ? tone : best)),
                lightness: parent ? lightnessAt(path(parent).length) : null,
            }
            rows.push(row)
            return {status: 201, body: view(row)}
        },

        update(id: string, body: { name?: string; hue?: number; lightness?: StoredConstellation['lightness'] }) {
            const row = find(id)
            if (!row) return refusal(404)
            if (body.name !== undefined) {
                const name = body.name.trim().replace(/\s+/g, ' ')
                if (!name || [...name].length > 40) return refusal(400)
                if (taken(row.parentId, name, row.id)) return refusal(409, 'CONSTELLATION_NAME_TAKEN')
                row.name = name
            }
            if (body.hue !== undefined) row.hue = body.hue
            if (body.lightness !== undefined) row.lightness = body.lightness
            return {status: 200, body: view(row)}
        },

        move(id: string, parentId: string | null) {
            const row = find(id)
            if (!row) return refusal(404)
            const parent = parentId ? find(parentId) : null
            if (parentId && !parent) return refusal(404)
            if (parent && path(parent).includes(row)) return refusal(409, 'CONSTELLATION_MOVE_CYCLE')
            if (taken(parentId, row.name, row.id)) return refusal(409, 'CONSTELLATION_NAME_TAKEN')
            if (!parent) {
                row.hue = path(row)[0].hue
                row.lightness = null
            } else if (row.parentId === null) {
                row.hue = null
                row.lightness = lightnessAt(path(parent).length)
            }
            row.parentId = parentId
            return {status: 200, body: view(row)}
        },

        remove(id: string, moveTo: string | null) {
            if (!find(id)) return refusal(404)
            const doomed = new Set(branchOf(id))
            if (moveTo && (!find(moveTo) || doomed.has(moveTo))) return refusal(moveTo && doomed.has(moveTo) ? 400 : 404)
            for (const [noteId, list] of [...places]) {
                if (!list.some((place) => doomed.has(place.id))) continue
                const outside = list.filter((place) => !doomed.has(place.id))
                store(noteId, outside.length > 0 ? withMain(outside)
                    : moveTo ? [{id: moveTo, main: true, at: ++clock}] : [])
            }
            rows.splice(0, rows.length, ...rows.filter((row) => !doomed.has(row.id)))
            return {status: 204, body: null}
        },

        deletion(id: string) {
            if (!find(id)) return refusal(404)
            const doomed = new Set(branchOf(id))
            const notesToMove = [...places.values()].filter((list) => list.every((place) => doomed.has(place.id))
                && list.some((place) => doomed.has(place.id))).length
            return {status: 200, body: {notesToMove}}
        },

        placesOf: (noteId: string) => answerPlaces(noteId),

        addPlace(noteId: string, id: string) {
            if (!find(id)) return refusal(404)
            const list = places.get(noteId) ?? []
            if (list.some((place) => place.id === id)) return answerPlaces(noteId)
            const onLine = list.filter((place) => isAncestor(place.id, id) || isAncestor(id, place.id))
            const rest = list.filter((place) => !onLine.includes(place))
            return store(noteId, [...rest, {id, main: rest.length === 0 || onLine.some((place) => place.main), at: ++clock}])
        },

        makeMain(noteId: string, id: string) {
            const list = places.get(noteId) ?? []
            if (!list.some((place) => place.id === id)) return refusal(404)
            return store(noteId, list.map((place) => ({...place, main: place.id === id})))
        },

        removePlace: (noteId: string, id: string) =>
            store(noteId, withMain((places.get(noteId) ?? []).filter((place) => place.id !== id))),

        notesIn: (id: string) => notesOf(id),

        isPlaced: (noteId: string) => places.has(noteId),

        /** Replaces a note's places as they are (a sub-note moving out, kept sub-notes taking a copy). */
        setPlaces(noteId: string, list: { constellationId: string; main: boolean }[]) {
            if (list.some((place) => !find(place.constellationId))) return refusal(404, 'CONSTELLATION_NOT_FOUND')
            return store(noteId, list.map((place) => ({id: place.constellationId, main: place.main, at: ++clock})))
        },
    }
}
