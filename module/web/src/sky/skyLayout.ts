import {
    forceLink,
    forceManyBody,
    forceSimulation,
    forceX,
    forceY,
    type Force,
    type Simulation,
    type SimulationLinkDatum,
    type SimulationNodeDatum,
} from 'd3-force'
import {rimRadius, type SkyNode, type SkySubgraph, YOU_ID} from './skyModel'
import type {SkyPhysics} from './skySettings'

/**
 * The live layout of one view. World coordinates are centred on YOU (or, in Focus, on the focused constellation);
 * the canvas maps them to the screen. Only structural edges (and, weakly, secondary ones) pull; stars with no place
 * are pushed to a rim beyond the branches.
 */
export interface SimNode extends SimulationNodeDatum {
    id: string
    node: SkyNode
    x: number
    y: number
}

export interface SimLink extends SimulationLinkDatum<SimNode> {
    source: SimNode
    target: SimNode
    kind: 'structural' | 'secondary'
}

export interface SkyLayout {
    simulation: Simulation<SimNode, SimLink>
    nodes: SimNode[]
    links: SimLink[]
    byId: Map<string, SimNode>
}

/** Distances follow the tree (reference length 150): YOU → root wide, branch → branch mid, a star close. */
function distanceOf(link: SimLink, linkDist: number): number {
    const k = linkDist / 150
    if (link.kind === 'secondary') return k * 110
    if (link.target.node.kind === 'constellation') return k * (link.source.id === YOU_ID ? 132 : 74)
    return k * 46
}

function strengthOf(link: SimLink, physics: SkyPhysics): number {
    if (link.kind === 'secondary') return 0.35 * physics.secondaryPull * physics.tension
    return (link.target.node.kind === 'constellation' ? 0.3 : 0.5) * physics.tension
}

/** True for a star with no place and for its sub-stars: they live on the rim. */
function onRim(node: SkyNode): boolean {
    return node.kind === 'star' && node.unplaced
}

/**
 * Pushes the top stars with no place towards a circle just beyond the farthest placed node; the circle grows with
 * the number of stars (`rimRadius`). Their sub-stars follow through their structural links.
 */
function rimForce(starCount: number): Force<SimNode, SimLink> {
    let nodes: SimNode[] = []
    const force = (alpha: number) => {
        let extent = 0
        for (const n of nodes) {
            if (onRim(n.node) || n.id === YOU_ID) continue
            extent = Math.max(extent, Math.hypot(n.x, n.y))
        }
        const radius = rimRadius(extent, starCount)
        for (const n of nodes) {
            if (!onRim(n.node) || n.node.parentId) continue
            const d = Math.hypot(n.x, n.y) || 1
            const pull = (radius - d) / d * alpha * RIM_STRENGTH
            n.vx = (n.vx ?? 0) + n.x * pull
            n.vy = (n.vy ?? 0) + n.y * pull
        }
    }
    force.initialize = (next: SimNode[]) => {
        nodes = next
    }
    return force
}

const RIM_STRENGTH = 0.5

/**
 * Seeds every node where its branch sits: roots share the circle by subtree size, children take a slice of their
 * parent's sector one ring further out, stars with no place spread round the rim. Deterministic for the same data, so
 * the same sky opens the same way.
 */
export function seedPositions(sub: SkySubgraph, starCount: number, center: string): Map<string, { x: number; y: number }> {
    const children = new Map<string, SkyNode[]>()
    for (const node of sub.nodes) {
        if (node.parentId) children.set(node.parentId, [...children.get(node.parentId) ?? [], node])
    }
    const size = new Map<string, number>()
    const sizeOf = (id: string): number => {
        const known = size.get(id)
        if (known != null) return known
        size.set(id, 1)
        const total = 1 + (children.get(id) ?? []).reduce((sum, child) => sum + sizeOf(child.id), 0)
        size.set(id, total)
        return total
    }
    const seeds = new Map<string, { x: number; y: number }>()
    const place = (id: string, from: number, to: number, distance: number) => {
        const kids = children.get(id) ?? []
        const total = kids.reduce((sum, kid) => sum + sizeOf(kid.id), 0) || 1
        let start = from
        for (const kid of kids) {
            const span = (to - from) * sizeOf(kid.id) / total
            const angle = start + span / 2
            const r = distance + (kid.kind === 'star' ? 46 : id === center ? 132 : 74)
            seeds.set(kid.id, {x: Math.cos(angle) * r, y: Math.sin(angle) * r})
            place(kid.id, start, start + span, r)
            start += span
        }
    }
    seeds.set(center, {x: 0, y: 0})
    place(center, -Math.PI, Math.PI, 0)
    const rim = sub.nodes.filter((n) => onRim(n) && !n.parentId)
    const radius = rimRadius(Math.max(0, ...[...seeds.values()].map((p) => Math.hypot(p.x, p.y))), starCount)
    rim.forEach((node, i) => {
        const angle = -Math.PI / 2 + i * 2 * Math.PI / rim.length
        seeds.set(node.id, {x: Math.cos(angle) * radius, y: Math.sin(angle) * radius})
        place(node.id, angle - 0.3, angle + 0.3, radius)
    })
    return seeds
}

export interface LayoutInput {
    sub: SkySubgraph
    physics: SkyPhysics
    starCount: number
    /** Focus: the constellation pinned at the centre; YOU is pinned at [youAt]. */
    focusId: string | null
    youAt: { x: number; y: number }
    /** Positions to start from (the previous layout of the same view); missing nodes are seeded. */
    previous: Map<string, { x: number; y: number }>
}

/** Builds the simulation; with no previous positions it is solved to rest synchronously so the first frame is final. */
export function createLayout({sub, physics, starCount, focusId, youAt, previous}: LayoutInput): SkyLayout {
    const center = focusId ?? YOU_ID
    const seeds = seedPositions(sub, starCount, center)
    const nodes: SimNode[] = sub.nodes.map((node) => {
        // Focus: the way home (the centre's ancestors) is not seeded by the tree walk; it lies towards YOU.
        const at = previous.get(node.id) ?? seeds.get(node.id) ?? {x: youAt.x * 0.5, y: youAt.y * 0.5}
        return {id: node.id, node, x: at.x, y: at.y}
    })
    const byId = new Map(nodes.map((n) => [n.id, n]))
    for (const n of nodes) {
        if (n.id === center) {
            n.fx = 0
            n.fy = 0
        } else if (n.id === YOU_ID) {
            n.fx = youAt.x
            n.fy = youAt.y
        }
    }
    const links: SimLink[] = sub.edges.flatMap((edge) => {
        const source = byId.get(edge.source)
        const target = byId.get(edge.target)
        return source && target ? [{source, target, kind: edge.kind}] : []
    })
    const gravity = (n: SimNode) => onRim(n.node) ? 0 : physics.gravity * 0.55
    const simulation = forceSimulation<SimNode, SimLink>(nodes)
        .force('charge', forceManyBody<SimNode>().strength(physics.repulsion * 1.15))
        .force('link', forceLink<SimNode, SimLink>(links)
            .distance((l) => distanceOf(l, physics.linkDist))
            .strength((l) => strengthOf(l, physics)))
        .force('x', forceX<SimNode>(0).strength(gravity))
        .force('y', forceY<SimNode>(0).strength(gravity))
        .force('rim', rimForce(starCount))
        .stop()
    const fresh = nodes.filter((n) => !previous.has(n.id)).length
    if (fresh > nodes.length / 2) {
        // Solve to rest at the default decay; big skies get fewer passes to keep the first frame quick.
        const steps = nodes.length > 800 ? 120 : 300
        for (let i = 0; i < steps; i++) simulation.tick()
    }
    simulation.alphaDecay(physics.alphaDecay)
    return {simulation, nodes, links, byId}
}

/** Applies changed physics to a running layout and reheats it gently, without moving anything by hand. */
export function applyPhysics(layout: SkyLayout, physics: SkyPhysics) {
    const gravity = (n: SimNode) => onRim(n.node) ? 0 : physics.gravity * 0.55
    const sim = layout.simulation
    ;(sim.force('charge') as ReturnType<typeof forceManyBody<SimNode>>).strength(physics.repulsion * 1.15)
    ;(sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>>)
        .distance((l) => distanceOf(l, physics.linkDist))
        .strength((l) => strengthOf(l, physics))
    ;(sim.force('x') as ReturnType<typeof forceX<SimNode>>).strength(gravity)
    ;(sim.force('y') as ReturnType<typeof forceY<SimNode>>).strength(gravity)
    sim.alphaDecay(physics.alphaDecay)
    sim.alpha(0.3).restart()
}
