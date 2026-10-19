import type {ConstellationLightness} from '@uliss/design-system'
import type {Constellation} from './constellationApi'

/** Longest constellation name, in code points; mirrors the service's `ConstellationNameNormalizer`. */
export const CONSTELLATION_NAME_LIMIT = 40

/** Mirrors the server rule: trimmed, whitespace runs collapsed, 1–40 code points. */
export function normalizeConstellationName(raw: string): string | null {
    const name = raw.trim().replace(/\s+/g, ' ')
    const length = Array.from(name).length
    return length > 0 && length <= CONSTELLATION_NAME_LIMIT ? name : null
}

export interface ConstellationNode {
    id: string
    parentId: string | null
    name: string
    hue: number
    lightness: ConstellationLightness
    depth: number
    /** Ancestors, root first. */
    ancestors: ConstellationNode[]
    children: ConstellationNode[]
    /** Notes in the node itself. */
    ownCount: number
    /** Notes in the whole subtree. */
    count: number
}

export interface ConstellationTree {
    roots: ConstellationNode[]
    /** Every node in display order: parents before children, siblings by name. */
    flat: ConstellationNode[]
    byId: Map<string, ConstellationNode>
}

const byName = (a: ConstellationNode, b: ConstellationNode) =>
    a.name.localeCompare(b.name, undefined, {sensitivity: 'base'})

/** Builds the tree from the service's flat list; a node whose parent is missing is dropped with its subtree. */
export function buildConstellationTree(items: Constellation[]): ConstellationTree {
    const byId = new Map<string, ConstellationNode>()
    for (const item of items) {
        byId.set(item.id, {
            id: item.id,
            parentId: item.parentId,
            name: item.name,
            hue: item.hue,
            lightness: item.lightness,
            depth: 0,
            ancestors: [],
            children: [],
            ownCount: item.noteCount,
            count: item.noteCount,
        })
    }
    const roots: ConstellationNode[] = []
    for (const node of byId.values()) {
        if (node.parentId == null) roots.push(node)
        else byId.get(node.parentId)?.children.push(node)
    }
    const flat: ConstellationNode[] = []
    const placed = new Map<string, ConstellationNode>()
    const visit = (node: ConstellationNode, ancestors: ConstellationNode[]) => {
        node.depth = ancestors.length
        node.ancestors = ancestors
        node.children.sort(byName)
        flat.push(node)
        placed.set(node.id, node)
        node.children.forEach((child) => visit(child, [...ancestors, node]))
        node.count = node.ownCount + node.children.reduce((sum, child) => sum + child.count, 0)
    }
    roots.sort(byName).forEach((root) => visit(root, []))
    return {roots, flat, byId: placed}
}

/** Ids of [node]'s descendants, without the node itself. */
export function descendantIds(node: ConstellationNode): string[] {
    return node.children.flatMap((child) => [child.id, ...descendantIds(child)])
}

/** Nodes shown by the collapsed tree: roots, plus the children of every open node whose ancestors are all open. */
export function visibleNodes(tree: ConstellationTree, open: ReadonlySet<string>): ConstellationNode[] {
    return tree.flat.filter((node) => node.ancestors.every((ancestor) => open.has(ancestor.id)))
}

export function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`
}
