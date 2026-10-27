import {noteTitleText} from '@uliss/design-system'
import type {NoteRef} from './constellationApi'
import type {ConstellationNode} from './constellationTree'

/** One stored change of a note's place; each is one atomic request to the note service. */
export type PlaceChange =
    /** Joins a constellation; a place on the same line gives way and passes on the main flag. */
    | { kind: 'add'; constellationId: string }
    | { kind: 'remove'; constellationId: string }
    | { kind: 'under'; parentNoteId: string }
    /** Takes a sub-note out from under its parent, into the constellation or without a place. */
    | { kind: 'out'; moveTo: string | null }

/** A change that asks first: the dialog names the target and what is lost. */
export interface PlaceConfirmation {
    title: string
    body: string
    confirm: string
    /** The confirm label while the change runs. */
    busy: string
    change: PlaceChange
}

/** One constellation of a top note, in the service's order: main first, then oldest first. */
export interface PlacedNode {
    node: ConstellationNode
    main: boolean
}

/** A constellation's path from the root, `Music / Jazz`. */
export function placePath(node: ConstellationNode): string {
    return [...node.ancestors, node].map((item) => item.name).join(' / ')
}

/** The parent notes a sub-note leaves, top first: `“Miles Davis” / “Kind of Blue”`. */
function chain(notes: NoteRef[]): string {
    return notes.map(quotedNote).join(' / ')
}

/** A note's name in a sentence, quoted. */
export function quotedNote(note: NoteRef): string {
    return `“${noteTitleText(note.title || 'Untitled note', note.icon)}”`
}

function list(paths: string[]): string {
    return paths.length < 2 ? paths.join('') : `${paths.slice(0, -1).join(', ')} and ${paths[paths.length - 1]}`
}

function onOneLine(a: ConstellationNode, b: ConstellationNode): boolean {
    return a.id !== b.id && (a.ancestors.some((node) => node.id === b.id) || b.ancestors.some((node) => node.id === a.id))
}

/** The path segments of a top note's place, root first; a cross on one moves the note to the segment before it. */
export function segmentsOf(node: ConstellationNode): ConstellationNode[] {
    return [...node.ancestors, node]
}

/**
 * A top note joins [target], and its places on the same line give way: a move up or down a line, or one more place
 * (null, nothing to confirm) when no place shares the line.
 */
export function topMoveTo(places: PlacedNode[], target: ConstellationNode): PlaceConfirmation | null {
    const lost = places.filter((place) => onOneLine(place.node, target))
    if (lost.length === 0) return null
    const kept = places.filter((place) => !lost.includes(place))
    const stays = kept.length > 0 ? ` It stays in ${list(kept.map((place) => placePath(place.node)))}.` : ''
    return {
        title: `Move to ${placePath(target)}?`,
        body: `It leaves ${list(lost.map((place) => placePath(place.node)))}.${stays}`,
        confirm: 'Move',
        busy: 'Moving…',
        change: {kind: 'add', constellationId: target.id},
    }
}

/** The cross on segment [index] of a top note's [place]: up to the segment before it, or off the root. */
export function topCross(places: PlacedNode[], place: PlacedNode, index: number): PlaceConfirmation {
    const segments = segmentsOf(place.node)
    if (index > 0) {
        // The place lies on the target's line, so the move always confirms.
        return topMoveTo(places, segments[index - 1]) as PlaceConfirmation
    }
    const kept = places.filter((item) => item !== place)
    const heir = place.main && kept.length > 0 ? ` ${placePath(kept[0].node)} becomes the main place.` : ''
    return {
        title: `Remove from ${placePath(place.node)}?`,
        body: kept.length === 0
            ? 'The note will have no place left.'
            : `It stays in ${list(kept.map((item) => placePath(item.node)))}.${heir}`,
        confirm: 'Remove',
        busy: 'Removing…',
        change: {kind: 'remove', constellationId: place.node.id},
    }
}

/** A top note goes under [parent] and leaves its constellations. */
export function topUnder(places: PlacedNode[], parent: NoteRef): PlaceConfirmation {
    const leaves = places.length > 0 ? `It leaves ${list(places.map((place) => placePath(place.node)))} and lives`
        : 'It will live'
    return {
        title: `Move under ${quotedNote(parent)}?`,
        body: `${leaves} where ${quotedNote(parent)} lives.`,
        confirm: 'Move',
        busy: 'Moving…',
        change: {kind: 'under', parentNoteId: parent.id},
    }
}

/**
 * A sub-note leaves its parent for [target] or no place; [topPlaces] are its top note's places, which it no longer
 * shares.
 */
export function subOut(ancestors: NoteRef[], topPlaces: PlacedNode[], target: ConstellationNode | null): PlaceConfirmation {
    const parent = ancestors[ancestors.length - 1]
    // Leaving the parent leaves every note above it too.
    const lost = topPlaces.map((place) => placePath(place.node)).filter((path) => target === null || path !== placePath(target))
    const goes = target ? ` and goes to ${placePath(target)} only.` : ' and will have no place.'
    const noLonger = lost.length > 0 ? ` It will no longer be in ${list(lost)}.` : ''
    return {
        title: target ? `Move to ${placePath(target)}?` : `Move out of ${quotedNote(parent)}?`,
        body: `It leaves ${chain(ancestors)}${goes}${noLonger}`,
        confirm: 'Move',
        busy: 'Moving…',
        change: {kind: 'out', moveTo: target?.id ?? null},
    }
}

/**
 * The cross on segment [index] of a sub-note's path: its top note's main line, then its parent notes. A cross on a
 * parent note moves it under the note before it; on the top note, into the main constellation (or no place); on a
 * constellation, into the one before it (or no place).
 */
export function subCross(ancestors: NoteRef[], topPlaces: PlacedNode[], index: number): PlaceConfirmation {
    const main = topPlaces.find((place) => place.main)?.node ?? null
    const constellations = main ? segmentsOf(main) : []
    if (index < constellations.length) {
        return subOut(ancestors, topPlaces, index > 0 ? constellations[index - 1] : null)
    }
    const at = index - constellations.length
    if (at === 0) return subOut(ancestors, topPlaces, main)
    const target = ancestors[at - 1]
    return {
        title: `Move under ${quotedNote(target)}?`,
        body: `It leaves ${chain(ancestors.slice(at))} and lives where ${quotedNote(target)} lives.`,
        confirm: 'Move',
        busy: 'Moving…',
        change: {kind: 'under', parentNoteId: target.id},
    }
}
