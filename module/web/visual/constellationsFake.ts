/**
 * In-memory note-service constellation tree for the harness (`visual/fakeApi.ts`). Keeps the service's rules that a
 * user can see: names unique among siblings regardless of case, palette tone for a new root, lightness by depth,
 * colour rules of a move, no moves into the own branch, branch delete.
 */
import {CONSTELLATIONS, type StoredConstellation} from './fixtures'

const PALETTE = [22, 42, 70, 88, 112, 152, 176, 200, 232, 264, 292, 316, 348]

export function createConstellationStore(empty: boolean) {
    const rows: StoredConstellation[] = empty ? [] : CONSTELLATIONS.map((row) => ({...row}))
    let sequence = 0

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
        noteCount: 0,
        ownNoteCount: 0,
    })
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

        remove(id: string) {
            const branch = (rootId: string): string[] =>
                [rootId, ...rows.filter((row) => row.parentId === rootId).flatMap((row) => branch(row.id))]
            if (!find(id)) return refusal(404)
            const doomed = new Set(branch(id))
            rows.splice(0, rows.length, ...rows.filter((row) => !doomed.has(row.id)))
            return {status: 204, body: null}
        },
    }
}
