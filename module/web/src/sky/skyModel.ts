import {constellationColor} from '@uliss/design-system'
import type {Sky} from '../constellations/constellationApi'
import {buildConstellationTree, type ConstellationTree} from '../constellations/constellationTree'

/**
 * The sky is the constellation tree drawn from the user outwards: YOU → root → sub-constellation → star (by the star's
 * main constellation) → sub-star. Only structural edges and, weakly, secondary ones hold the layout up. A star with no
 * place has no edge at all and drifts to the rim.
 */
export type SkyNodeKind = 'you' | 'constellation' | 'star'
export type SkyEdgeKind = 'structural' | 'secondary'
export type SkyView = 'skeleton' | 'focus' | 'full'

export const YOU_ID = '__you'

export interface SkyNode {
    id: string
    kind: SkyNodeKind
    label: string
    /** 0 for YOU, 1 for a root, one more per level below; a star is one below its parent. */
    depth: number
    /** The structural parent's id; null for YOU and for a star with no place. */
    parentId: string | null
    /** A constellation's own colour, a star's colours from its top note's memberships (main first); empty: neutral. */
    colors: string[]
    /** Constellations the node belongs to for the branch filter: itself, or the top note's memberships. */
    constellationIds: string[]
    /** True for a star with no constellation anywhere above it. */
    unplaced: boolean
    /** Order of growth for the replay: constellations first, stars oldest first. */
    order: number
}

export interface SkyEdge {
    source: string
    target: string
    kind: SkyEdgeKind
}

export interface SkyGraph {
    nodes: SkyNode[]
    edges: SkyEdge[]
    byId: Map<string, SkyNode>
    starCount: number
    tree: ConstellationTree
}

/** Builds the full graph from the snapshot; every view is a subset of it. */
export function buildSkyGraph(sky: Sky): SkyGraph {
    const tree = buildConstellationTree(sky.constellations)
    const nodes: SkyNode[] = [{
        id: YOU_ID, kind: 'you', label: 'You', depth: 0, parentId: null, colors: [], constellationIds: [],
        unplaced: false, order: 0,
    }]
    const edges: SkyEdge[] = []
    for (const constellation of tree.flat) {
        nodes.push({
            id: constellation.id,
            kind: 'constellation',
            label: constellation.name,
            depth: constellation.depth + 1,
            parentId: constellation.parentId ?? YOU_ID,
            colors: [constellationColor(constellation.hue, constellation.lightness)],
            constellationIds: [constellation.id],
            unplaced: false,
            order: nodes.length,
        })
        edges.push({source: constellation.parentId ?? YOU_ID, target: constellation.id, kind: 'structural'})
    }

    const notes = new Map(sky.notes.map((note) => [note.id, note]))
    const stars = new Map<string, SkyNode>()
    // A sub-star takes the place of its top star, so stars are resolved parent first; memo + guard against cycles.
    const resolve = (id: string, seen: Set<string>): SkyNode | null => {
        const done = stars.get(id)
        if (done) return done
        const note = notes.get(id)
        if (!note || seen.has(id)) return null
        seen.add(id)
        const parent = note.parentNoteId ? resolve(note.parentNoteId, seen) : null
        const places = parent ? [] : note.memberships.filter((m) => tree.byId.has(m.constellationId))
        const main = places[0] ? tree.byId.get(places[0].constellationId) : undefined
        const node: SkyNode = parent ? {
            id: note.id,
            kind: 'star',
            label: note.title,
            depth: parent.depth + 1,
            parentId: parent.id,
            colors: parent.colors,
            constellationIds: parent.constellationIds,
            unplaced: parent.unplaced,
            order: 0,
        } : {
            id: note.id,
            kind: 'star',
            label: note.title,
            depth: main ? main.depth + 2 : 1,
            parentId: main?.id ?? null,
            colors: places.map((m) => {
                const c = tree.byId.get(m.constellationId)!
                return constellationColor(c.hue, c.lightness)
            }),
            constellationIds: places.map((m) => m.constellationId),
            unplaced: !main,
            order: 0,
        }
        stars.set(id, node)
        return node
    }
    for (const note of sky.notes) {
        const node = resolve(note.id, new Set())
        if (!node) continue
        node.order = nodes.length
        nodes.push(node)
        if (node.parentId) edges.push({source: node.parentId, target: node.id, kind: 'structural'})
        if (!notes.get(note.id)?.parentNoteId) {
            node.constellationIds.slice(1).forEach((id) => edges.push({source: node.id, target: id, kind: 'secondary'}))
        }
    }
    return {
        nodes,
        edges,
        byId: new Map(nodes.map((node) => [node.id, node])),
        starCount: nodes.length - 1 - tree.flat.length,
        tree,
    }
}

export interface SkySubgraph {
    nodes: SkyNode[]
    edges: SkyEdge[]
}

function pick(graph: SkyGraph, keep: Set<string>, kinds: readonly SkyEdgeKind[]): SkySubgraph {
    return {
        nodes: graph.nodes.filter((node) => keep.has(node.id)),
        edges: graph.edges.filter((e) => kinds.includes(e.kind) && keep.has(e.source) && keep.has(e.target)),
    }
}

/**
 * The nodes one view shows. Skeleton: YOU and the constellations. Full: everything. Focus on a constellation: the
 * way home (its ancestors), its stars with their sub-stars and, for [depth] 2 and 3, one or two levels of
 * sub-constellations with theirs.
 */
export function subgraph(graph: SkyGraph, view: SkyView, focusId: string | null = null, depth = 2): SkySubgraph {
    if (view === 'full') return pick(graph, new Set(graph.byId.keys()), ['structural', 'secondary'])
    if (view === 'skeleton' || !focusId || graph.byId.get(focusId)?.kind !== 'constellation') {
        const keep = new Set(graph.nodes.filter((n) => n.kind !== 'star').map((n) => n.id))
        return pick(graph, keep, ['structural'])
    }
    const children = new Map<string, SkyNode[]>()
    for (const node of graph.nodes) {
        if (node.parentId) children.set(node.parentId, [...children.get(node.parentId) ?? [], node])
    }
    const keep = new Set<string>([YOU_ID])
    for (let id: string | null = focusId; id; id = graph.byId.get(id)?.parentId ?? null) keep.add(id)
    const walk = (id: string, level: number) => {
        keep.add(id)
        for (const child of children.get(id) ?? []) {
            if (child.kind === 'star') walk(child.id, level)
            else if (level < depth) walk(child.id, level + 1)
        }
    }
    walk(focusId, 1)
    return pick(graph, keep, ['structural', 'secondary'])
}

/** Whether [node] lies in the branch of [constellationId]; YOU always does, a star with no place never. */
export function inBranch(graph: SkyGraph, node: SkyNode, constellationId: string): boolean {
    if (node.kind === 'you') return true
    return node.constellationIds.some((id) =>
        id === constellationId || (graph.tree.byId.get(id)?.ancestors.some((a) => a.id === constellationId) ?? false))
}

/**
 * Full stays the default only while the sky is sparse enough to read: nodes per 100 000 px² of the visible sky. The
 * number is picked by eye (Product Logic: «опытным путём»); retune it against real skies.
 */
export const FULL_DENSITY_MAX = 14

export function defaultView(nodeCount: number, width: number, height: number): SkyView {
    const area = Math.max(1, width * height) / 100_000
    return nodeCount / area <= FULL_DENSITY_MAX ? 'full' : 'skeleton'
}

/**
 * How far from the centre the stars with no place settle: beyond the farthest placed node by a gap that grows with
 * the number of stars (√n), so they never float among the branches and never wander off an almost empty sky.
 */
export function rimRadius(placedExtent: number, starCount: number): number {
    const gap = RIM_GAP + RIM_GAP_PER_STAR * Math.sqrt(Math.max(0, starCount))
    return Math.max(RIM_MIN, placedExtent + gap)
}

const RIM_MIN = 150
const RIM_GAP = 70
const RIM_GAP_PER_STAR = 16
