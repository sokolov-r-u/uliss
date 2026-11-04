import {describe, expect, it} from 'vitest'
import {buildConstellationTree} from '../constellations/constellationTree'
import type {Constellation} from '../constellations/constellationApi'
import {addToFilter, FILTER_LIMIT, knownFilter, readFilter, withFilter} from './notesFilter'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const node = (n: number, parent: number | null): Constellation => ({
    id: id(n), parentId: parent === null ? null : id(parent), name: `C${n}`, hue: 10, lightness: 'BASE',
    noteCount: 0, ownNoteCount: 0,
})

// 1 › 2 › 3, and a second root 4
const tree = buildConstellationTree([node(1, null), node(2, 1), node(3, 2), node(4, null)])

describe('notes filter', () => {
    it('reads only uuids from the URL, lower-cased, each once, at most the service limit', () => {
        const many = Array.from({length: FILTER_LIMIT + 5}, (_, n) => `constellation=${id(n + 10)}`).join('&')
        const params = new URLSearchParams(`constellation=${id(1).toUpperCase()}&constellation=music&constellation=` +
            `&constellation=${id(1)}&${many}`)

        const filter = readFilter(params)

        expect(filter[0]).toBe(id(1))
        expect(filter).toHaveLength(FILTER_LIMIT)
        expect(new Set(filter).size).toBe(FILTER_LIMIT)
        expect(filter).not.toContain('music')
    })

    it('writes the filter in place of the old one and keeps the other parameters', () => {
        const next = withFilter(new URLSearchParams(`tab=x&constellation=${id(9)}`), [id(1), id(2)])

        expect(next.get('tab')).toBe('x')
        expect(next.getAll('constellation')).toEqual([id(1), id(2)])
        expect(withFilter(next, []).has('constellation')).toBe(false)
    })

    it('adding an ancestor absorbs its chosen descendants; other picks and repeats stay as they are', () => {
        expect(addToFilter([id(3), id(4)], id(1), tree)).toEqual([id(4), id(1)])
        expect(addToFilter([id(1)], id(4), tree)).toEqual([id(1), id(4)])
        expect(addToFilter([id(1)], id(1), tree)).toEqual([id(1)])
    })

    it('drops the ids the loaded tree does not have', () => {
        expect(knownFilter([id(1), id(99), id(4)], tree)).toEqual([id(1), id(4)])
    })
})
