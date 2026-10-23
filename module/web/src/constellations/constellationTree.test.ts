import {describe, expect, it} from 'vitest'
import type {Constellation} from './constellationApi'
import {buildConstellationTree, descendantIds, normalizeConstellationName, pickerNotes, visibleNodes} from './constellationTree'

function item(id: string, parentId: string | null, name: string, noteCount = 0, ownNoteCount = noteCount): Constellation {
    return {id, parentId, name, hue: 264, lightness: parentId ? 'LIGHT' : 'BASE', noteCount, ownNoteCount}
}

// The service counts distinct notes per subtree: Music holds 7, not the 10 its parts add up to.
const ITEMS = [
    item('miles', 'jazz', 'Miles', 2),
    item('music', null, 'music', 7, 3),
    item('jazz', 'music', 'Jazz', 5, 4),
    item('ambient', 'music', 'ambient', 1),
    item('films', null, 'Films'),
]

describe('buildConstellationTree', () => {
    it('orders parents before children and siblings by name regardless of case', () => {
        const tree = buildConstellationTree(ITEMS)

        expect(tree.flat.map((node) => node.id)).toEqual(['films', 'music', 'ambient', 'jazz', 'miles'])
        expect(tree.roots.map((node) => node.id)).toEqual(['films', 'music'])
    })

    it('gives every node its depth, ancestors and the service note counts of the node and its subtree', () => {
        const tree = buildConstellationTree(ITEMS)
        const miles = tree.byId.get('miles')!
        const music = tree.byId.get('music')!

        expect(miles.depth).toBe(2)
        expect(miles.ancestors.map((node) => node.name)).toEqual(['music', 'Jazz'])
        expect(music.ownCount).toBe(3)
        expect(music.count).toBe(7)
        expect(tree.byId.get('jazz')!.count).toBe(5)
    })

    it('drops a node whose parent is missing, with its subtree', () => {
        const tree = buildConstellationTree([item('orphan', 'gone', 'Orphan'), item('child', 'orphan', 'Child')])

        expect(tree.flat).toEqual([])
        expect(tree.byId.size).toBe(0)
    })

    it('lists the descendants of a branch without the branch itself', () => {
        const tree = buildConstellationTree(ITEMS)

        expect(descendantIds(tree.byId.get('music')!)).toEqual(['ambient', 'jazz', 'miles'])
        expect(descendantIds(tree.byId.get('films')!)).toEqual([])
    })

    it('shows only roots until their branches are opened, and a child only under an open path', () => {
        const tree = buildConstellationTree(ITEMS)
        const ids = (open: string[]) => visibleNodes(tree, new Set(open)).map((node) => node.id)

        expect(ids([])).toEqual(['films', 'music'])
        expect(ids(['music'])).toEqual(['films', 'music', 'ambient', 'jazz'])
        expect(ids(['jazz'])).toEqual(['films', 'music'])
        expect(ids(['music', 'jazz'])).toEqual(['films', 'music', 'ambient', 'jazz', 'miles'])
    })
})

describe('normalizeConstellationName', () => {
    it('trims and collapses whitespace like the service', () => {
        expect(normalizeConstellationName('  Glam \t rock ')).toBe('Glam rock')
    })

    it('allows 1 to 40 code points', () => {
        expect(normalizeConstellationName('   ')).toBeNull()
        expect(normalizeConstellationName('🎵'.repeat(40))).toBe('🎵'.repeat(40))
        expect(normalizeConstellationName('🎵'.repeat(41))).toBeNull()
    })
})

describe('pickerNotes', () => {
    it('gives the picker each note with its icon, null for a note without one', () => {
        const notes = pickerNotes([
            {id: 'bowie', title: 'Bowie', icon: '🎸', parentNoteId: null, createdAt: '2026-10-20T10:00:00Z',
                memberships: [{constellationId: 'rock', main: true}]},
            {id: 'low', title: 'Low', parentNoteId: 'bowie', createdAt: '2026-10-20T11:00:00Z', memberships: []},
        ])

        expect(notes).toEqual([
            {id: 'bowie', title: 'Bowie', icon: '🎸', parentId: null, constellationIds: ['rock']},
            {id: 'low', title: 'Low', icon: null, parentId: 'bowie', constellationIds: []},
        ])
    })
})
