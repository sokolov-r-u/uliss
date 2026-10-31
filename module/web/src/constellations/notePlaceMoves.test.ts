import {describe, expect, it} from 'vitest'
import type {Constellation, NoteRef} from './constellationApi'
import {buildConstellationTree} from './constellationTree'
import {type PlacedNode, subCross, subOut, topCross, topMoveTo, topUnder} from './notePlaceMoves'

function node(id: string, parentId: string | null, name: string): Constellation {
    return {id, parentId, name, hue: 264, lightness: parentId ? 'LIGHT' : 'BASE', noteCount: 0, ownNoteCount: 0}
}

const tree = buildConstellationTree([
    node('music', null, 'Music'), node('jazz', 'music', 'Jazz'), node('bebop', 'jazz', 'Bebop'),
    node('rock', 'music', 'Rock'), node('cinema', null, 'Cinema'), node('biopics', 'cinema', 'Biopics'),
])
const at = (id: string, main = false): PlacedNode => ({node: tree.byId.get(id)!, main})

const MILES: NoteRef = {id: 'miles', title: 'Miles Davis'}
const BLUE: NoteRef = {id: 'blue', title: 'Kind of Blue', icon: '🎷'}

describe('top note', () => {
    const bebop = at('bebop', true)
    const biopics = at('biopics')

    it('moves to the segment before a cross, leaving every place on that line', () => {
        const places = [bebop, at('rock'), biopics]

        expect(topCross(places, bebop, 2)).toEqual({
            title: 'Move to Music / Jazz?',
            body: 'It leaves Music / Jazz / Bebop. It stays in Music / Rock and Cinema / Biopics.',
            confirm: 'Move', busy: 'Moving…',
            change: {kind: 'add', constellationId: 'jazz'},
        })
        // Music lies above Rock too: both places give way.
        expect(topCross(places, bebop, 1)).toMatchObject({
            body: 'It leaves Music / Jazz / Bebop and Music / Rock. It stays in Cinema / Biopics.',
            change: {kind: 'add', constellationId: 'music'},
        })
    })

    it('removes the place off its root and names the heir of a lost main', () => {
        expect(topCross([bebop, biopics], bebop, 0)).toEqual({
            title: 'Remove from Music / Jazz / Bebop?',
            body: 'It stays in Cinema / Biopics. Cinema / Biopics becomes the main place.',
            confirm: 'Remove', busy: 'Removing…',
            change: {kind: 'remove', constellationId: 'bebop'},
        })
        expect(topCross([bebop, biopics], biopics, 0).body).toBe('It stays in Music / Jazz / Bebop.')
        expect(topCross([bebop], bebop, 0).body).toBe('The note will have no place left.')
    })

    it('adds a place on another line at once, and asks when a place gives way', () => {
        expect(topMoveTo([bebop], tree.byId.get('biopics')!)).toBeNull()
        expect(topMoveTo([at('jazz', true)], tree.byId.get('bebop')!)).toMatchObject({
            title: 'Move to Music / Jazz / Bebop?',
            body: 'It leaves Music / Jazz.',
            change: {kind: 'add', constellationId: 'bebop'},
        })
    })

    it('goes under a note, leaving its constellations', () => {
        expect(topUnder([bebop, biopics], BLUE)).toMatchObject({
            title: 'Move under “🎷 Kind of Blue”?',
            body: 'It leaves Music / Jazz / Bebop and Cinema / Biopics and lives where “🎷 Kind of Blue” lives.',
            change: {kind: 'under', parentNoteId: 'blue'},
        })
        expect(topUnder([], {id: 'x'}).body).toBe('It will live where “Untitled note” lives.')
    })
})

describe('sub-note', () => {
    // Music / Jazz / "Miles Davis" / "Kind of Blue" / (this); Miles Davis is also in Cinema / Biopics.
    const ancestors = [MILES, BLUE]
    const topPlaces = [at('jazz', true), at('biopics')]

    it('maps each cross to the segment before it along the main line', () => {
        expect([0, 1, 2, 3].map((index) => subCross(ancestors, topPlaces, index).change)).toEqual([
            {kind: 'out', moveTo: null},
            {kind: 'out', moveTo: 'music'},
            {kind: 'out', moveTo: 'jazz'},
            {kind: 'under', parentNoteId: 'miles'},
        ])
    })

    it('names the parent notes it leaves and the parent\'s places it no longer shares', () => {
        expect(subCross(ancestors, topPlaces, 3)).toMatchObject({
            title: 'Move under “Miles Davis”?',
            body: 'It leaves “🎷 Kind of Blue” and lives where “Miles Davis” lives.',
        })
        expect(subCross(ancestors, topPlaces, 2)).toMatchObject({
            title: 'Move to Music / Jazz?',
            body: 'It leaves “Miles Davis” / “🎷 Kind of Blue” and goes to Music / Jazz only.'
                + ' It will no longer be in Cinema / Biopics.',
        })
        expect(subCross(ancestors, topPlaces, 0)).toMatchObject({
            title: 'Move out of “🎷 Kind of Blue”?',
            body: 'It leaves “Miles Davis” / “🎷 Kind of Blue” and will have no place.'
                + ' It will no longer be in Music / Jazz and Cinema / Biopics.',
        })
    })

    it('leaves a top note without a place for no place, and moves deeper chains under the note above', () => {
        expect(subCross([MILES], [], 0)).toMatchObject({
            change: {kind: 'out', moveTo: null},
            body: 'It leaves “Miles Davis” and will have no place.',
        })
        const side: NoteRef = {id: 'side', title: 'Side A'}
        expect(subCross([MILES, BLUE, side], [], 1)).toMatchObject({
            change: {kind: 'under', parentNoteId: 'miles'},
            body: 'It leaves “🎷 Kind of Blue” / “Side A” and lives where “Miles Davis” lives.',
        })
    })

    it('moves out into a picked constellation', () => {
        expect(subOut(ancestors, topPlaces, tree.byId.get('rock')!)).toMatchObject({
            change: {kind: 'out', moveTo: 'rock'},
            body: 'It leaves “Miles Davis” / “🎷 Kind of Blue” and goes to Music / Rock only.'
                + ' It will no longer be in Music / Jazz and Cinema / Biopics.',
        })
    })
})
