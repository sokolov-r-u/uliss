import fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import type {Constellation, Sky, SkyStar} from '../constellations/constellationApi'
import {
    buildSkyGraph,
    defaultView,
    inBranch,
    labelLines,
    LABEL_WRAP_AT,
    nearestStars,
    nextInDirection,
    rimRadius,
    segmentDistance,
    subgraph,
    YOU_ID,
} from './skyModel'

function constellation(id: string, parentId: string | null, name: string, hue = 264): Constellation {
    return {id, parentId, name, hue, lightness: parentId ? 'LIGHT' : 'BASE', noteCount: 0, ownNoteCount: 0}
}

function star(id: string, title: string, places: string[] = [], parentNoteId: string | null = null): SkyStar {
    return {
        id, title, parentNoteId, createdAt: '2026-10-20T10:00:00Z',
        memberships: places.map((constellationId, i) => ({constellationId, main: i === 0})),
    }
}

// Music › Rock › Glam, Films; Bowie in Rock (main) and Films, Low under Bowie, Loose without a place.
const SKY: Sky = {
    constellations: [
        constellation('music', null, 'Music'),
        constellation('rock', 'music', 'Rock'),
        constellation('glam', 'rock', 'Glam'),
        constellation('films', null, 'Films', 22),
    ],
    notes: [
        star('bowie', 'Bowie', ['rock', 'films']),
        star('low', 'Low', [], 'bowie'),
        star('loose', 'Loose thought'),
        star('ziggy', 'Ziggy', ['glam']),
    ],
}

const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id).sort()

describe('buildSkyGraph', () => {
    const graph = buildSkyGraph(SKY)

    it('grows the tree from YOU and hangs each star on its main constellation, a sub-star on its parent', () => {
        const structural = graph.edges.filter((e) => e.kind === 'structural').map((e) => `${e.source}>${e.target}`)
        expect(structural).toEqual(expect.arrayContaining([
            `${YOU_ID}>music`, `${YOU_ID}>films`, 'music>rock', 'rock>glam', 'rock>bowie', 'bowie>low', 'glam>ziggy',
        ]))
        expect(graph.byId.get('bowie')?.depth).toBe(graph.byId.get('rock')!.depth + 1)
        expect(graph.starCount).toBe(4)
    })

    it('draws a secondary edge to each other constellation of a top star only', () => {
        expect(graph.edges.filter((e) => e.kind === 'secondary')).toEqual([{source: 'bowie', target: 'films', kind: 'secondary'}])
    })

    it('gives a star the colours of its places, main first, and a sub-star those of its top star', () => {
        const bowie = graph.byId.get('bowie')!
        expect(bowie.colors).toHaveLength(2)
        expect(bowie.colors[0]).toContain(' 264)')
        expect(bowie.colors[1]).toContain(' 22)')
        expect(graph.byId.get('low')?.colors).toEqual(bowie.colors)
        expect(graph.byId.get('low')?.constellationIds).toEqual(['rock', 'films'])
    })

    it('leaves a star without a place unattached and neutral', () => {
        const loose = graph.byId.get('loose')!
        expect(loose.unplaced).toBe(true)
        expect(loose.parentId).toBeNull()
        expect(loose.colors).toEqual([])
        expect(graph.edges.some((e) => e.target === 'loose')).toBe(false)
    })

    it('treats a membership in a constellation missing from the snapshot as no place', () => {
        const lost = buildSkyGraph({...SKY, notes: [star('lost', 'Lost', ['gone'])]})
        expect(lost.byId.get('lost')?.unplaced).toBe(true)
    })

    it('orders growth: constellations first, then stars oldest first', () => {
        const orders = graph.nodes.map((n) => n.order)
        expect(orders).toEqual([...orders].sort((a, b) => a - b))
        expect(graph.byId.get('films')!.order).toBeLessThan(graph.byId.get('bowie')!.order)
    })
})

describe('subgraph', () => {
    const graph = buildSkyGraph(SKY)

    it('Skeleton shows YOU and the constellations with their structural edges only', () => {
        const sub = subgraph(graph, 'skeleton')
        expect(ids(sub.nodes)).toEqual([YOU_ID, 'films', 'glam', 'music', 'rock'])
        expect(sub.edges.every((e) => e.kind === 'structural')).toBe(true)
    })

    it('Full shows everything', () => {
        const sub = subgraph(graph, 'full')
        expect(sub.nodes).toHaveLength(graph.nodes.length)
        expect(sub.edges).toHaveLength(graph.edges.length)
    })

    it('Focus keeps the way home and, by depth, the focused branch with its stars and sub-stars', () => {
        expect(ids(subgraph(graph, 'focus', 'rock', 1).nodes)).toEqual([YOU_ID, 'bowie', 'low', 'music', 'rock'])
        expect(ids(subgraph(graph, 'focus', 'rock', 2).nodes)).toEqual([YOU_ID, 'bowie', 'glam', 'low', 'music', 'rock', 'ziggy'])
    })

    it('Focus on something that is not a constellation falls back to Skeleton', () => {
        expect(ids(subgraph(graph, 'focus', 'bowie').nodes)).toEqual(ids(subgraph(graph, 'skeleton').nodes))
    })
})

describe('inBranch', () => {
    const graph = buildSkyGraph(SKY)

    it('holds a constellation, its descendants and every star placed anywhere inside', () => {
        const node = (id: string) => graph.byId.get(id)!
        expect(inBranch(graph, node('glam'), 'music')).toBe(true)
        expect(inBranch(graph, node('ziggy'), 'music')).toBe(true)
        expect(inBranch(graph, node('bowie'), 'films')).toBe(true)
        expect(inBranch(graph, node('low'), 'films')).toBe(true)
        expect(inBranch(graph, node('films'), 'music')).toBe(false)
        expect(inBranch(graph, node('loose'), 'music')).toBe(false)
        expect(inBranch(graph, node(YOU_ID), 'films')).toBe(true)
    })
})

describe('sky geometry', () => {
    it('opens Full while the sky is sparse and Skeleton once it is dense', () => {
        expect(defaultView(10, 1000, 700)).toBe('full')
        expect(defaultView(500, 1000, 700)).toBe('skeleton')
    })

    it('puts the rim beyond the branches and further out as stars grow, with a floor for an empty sky', () => {
        expect(rimRadius(0, 0)).toBeGreaterThan(0)
        for (const extent of [0, 50, 300]) {
            let previous = rimRadius(extent, 0)
            expect(previous).toBeGreaterThan(extent)
            for (const stars of [1, 10, 100, 1000]) {
                const next = rimRadius(extent, stars)
                expect(next).toBeGreaterThanOrEqual(previous)
                previous = next
            }
        }
    })

    it('finds the nearest points within the radius, nearest first, at most the count', () => {
        const points = [{id: 'far', x: 200, y: 0}, {id: 'b', x: 30, y: 0}, {id: 'a', x: 10, y: 0}, {id: 'c', x: 0, y: 50}]
        expect(nearestStars(points, {x: 0, y: 0}, 2, 100)).toEqual(['a', 'b'])
        expect(nearestStars(points, {x: 0, y: 0}, 10, 100)).toEqual(['a', 'b', 'c'])
        expect(nearestStars(points, {x: 0, y: 0}, 0, 100)).toEqual([])
    })

    it('measures the distance to a segment, not to its line', () => {
        expect(segmentDistance({x: 5, y: 3}, {x: 0, y: 0}, {x: 10, y: 0})).toBeCloseTo(3)
        expect(segmentDistance({x: 14, y: 3}, {x: 0, y: 0}, {x: 10, y: 0})).toBeCloseTo(5)
        expect(segmentDistance({x: 3, y: 4}, {x: 0, y: 0}, {x: 0, y: 0})).toBeCloseTo(5)
    })
})

describe('labelLines', () => {
    it('keeps a short name or one long word on one line', () => {
        expect(labelLines('Bowie')).toEqual(['Bowie'])
        expect(labelLines('Supercalifragilisticexpialidocious')).toEqual(['Supercalifragilisticexpialidocious'])
    })

    it('breaks a long name at the space nearest its middle', () => {
        expect(labelLines('A grammar for mornings and nights')).toEqual(['A grammar for', 'mornings and nights'])
    })

    it('loses no word and balances the halves for any long title', () => {
        const words = ['why', 'I', 'resisted', 'it', 'notes', 'on', 'forgetting', 'and', 'the', 'long', 'thread']
        for (let n = 2; n <= words.length; n++) {
            const title = words.slice(0, n).join(' ')
            const lines = labelLines(title)
            expect(lines.join(' ')).toBe(title)
            if (Array.from(title).length <= LABEL_WRAP_AT) {
                expect(lines).toHaveLength(1)
                continue
            }
            expect(lines).toHaveLength(2)
            // no other space would give halves closer in length
            const gap = Math.abs(lines[0].length - lines[1].length)
            for (let i = 0; i < title.length; i++) {
                if (title[i] !== ' ') continue
                expect(gap).toBeLessThanOrEqual(Math.abs(i - (title.length - i - 1)) + 1)
            }
        }
    })
})

describe('nextInDirection', () => {
    const from = {id: 'from', x: 100, y: 100}

    it('goes to the nearest point the arrow points at, preferring the cone over a nearer point off it', () => {
        const points = [from, {id: 'right-far', x: 200, y: 105}, {id: 'diagonal-near', x: 130, y: 160}, {id: 'left', x: 40, y: 100}]

        expect(nextInDirection(points, 'from', 'ArrowRight')).toBe('right-far')
        expect(nextInDirection(points, 'from', 'ArrowLeft')).toBe('left')
        expect(nextInDirection(points, 'from', 'ArrowDown')).toBe('diagonal-near')
    })

    it('takes a point off the cone when the cone is empty, and nothing when that side is empty', () => {
        const points = [from, {id: 'low-right', x: 120, y: 190}]

        expect(nextInDirection(points, 'from', 'ArrowRight')).toBe('low-right')
        expect(nextInDirection(points, 'from', 'ArrowUp')).toBeNull()
    })

    it('starts at the first point when the current one is gone', () => {
        expect(nextInDirection([{id: 'a', x: 0, y: 0}], 'gone', 'ArrowRight')).toBe('a')
    })

    it('never stays put and always moves to the side the arrow names', () => {
        const point = fc.record({x: fc.integer({min: -500, max: 500}), y: fc.integer({min: -500, max: 500})})
        const key = fc.constantFrom('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' as const)
        fc.assert(fc.property(fc.array(point, {minLength: 1, maxLength: 12}), key, (raw, arrow) => {
            const points = raw.map((p, i) => ({id: `p${i}`, ...p}))
            const start = points[0]
            const next = nextInDirection(points, start.id, arrow)
            if (next === null) return
            const target = points.find((p) => p.id === next)!
            expect(next).not.toBe(start.id)
            if (arrow === 'ArrowRight') expect(target.x).toBeGreaterThan(start.x)
            if (arrow === 'ArrowLeft') expect(target.x).toBeLessThan(start.x)
            if (arrow === 'ArrowDown') expect(target.y).toBeGreaterThan(start.y)
            if (arrow === 'ArrowUp') expect(target.y).toBeLessThan(start.y)
        }))
    })
})
