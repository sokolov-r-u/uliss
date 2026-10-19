import type {CSSProperties} from 'react'
import {constellationColor, Icon, IconButton, TagDot} from '@uliss/design-system'
import {type ConstellationNode, type ConstellationTree, visibleNodes} from './constellationTree'

export interface ConstellationTreeViewProps {
    tree: ConstellationTree
    open: ReadonlySet<string>
    selectedId: string | null
    onToggle: (id: string) => void
    onSelect: (id: string) => void
    /** The muted last row of notes with no place; absent when there are none. */
    unplaced?: { count: number; selected: boolean; onSelect: () => void }
}

/**
 * The tree, collapsed to the open branches: dot, name, subtree count, and a volume bar on every root; then the muted
 * "Without constellation" row.
 */
export function ConstellationTreeView({tree, open, selectedId, onToggle, onSelect, unplaced}: ConstellationTreeViewProps) {
    const maxRoot = Math.max(0, ...tree.roots.map((root) => root.count))
    return (
        <ul className="constellation-tree" aria-label="Constellations">
            {visibleNodes(tree, open).map((node) => (
                <TreeRow key={node.id} node={node} open={open.has(node.id)} selected={node.id === selectedId}
                         maxRoot={maxRoot} onToggle={onToggle} onSelect={onSelect}/>
            ))}
            {unplaced && <li className={unplaced.selected ? 'constellation-row unplaced selected' : 'constellation-row unplaced'}
                             style={{'--depth': 0, '--branch-color': 'var(--text-faint)'} as CSSProperties}>
                <span className="constellation-row-toggle"/>
                <button type="button" className="constellation-row-select" aria-current={unplaced.selected || undefined}
                        onClick={unplaced.onSelect}>
                    <span className="constellation-row-name">Without constellation</span>
                    <span className="constellation-row-count">{unplaced.count}</span>
                </button>
            </li>}
        </ul>
    )
}

function TreeRow({node, open, selected, maxRoot, onToggle, onSelect}: {
    node: ConstellationNode
    open: boolean
    selected: boolean
    maxRoot: number
    onToggle: (id: string) => void
    onSelect: (id: string) => void
}) {
    const color = constellationColor(node.hue, node.lightness)
    const hasChildren = node.children.length > 0
    const style = {'--depth': node.depth, '--branch-color': color} as CSSProperties
    return (
        <li className={selected ? 'constellation-row selected' : 'constellation-row'} style={style}>
            {node.depth > 0 && <span className="constellation-row-guide" aria-hidden="true"/>}
            <span className="constellation-row-toggle">
                {hasChildren && <IconButton s={44} title={`${open ? 'Collapse' : 'Expand'} ${node.name}`}
                                            aria-expanded={open} onClick={() => onToggle(node.id)}>
                    <Icon name="chevron" size={11} rotate={open ? 0 : -90}/>
                </IconButton>}
            </span>
            <button type="button" className="constellation-row-select" aria-current={selected || undefined}
                    onClick={() => onSelect(node.id)}>
                <TagDot color={color} size={node.depth === 0 ? 9 : 7}/>
                <span className={node.depth === 0 ? 'constellation-row-name root' : 'constellation-row-name'}>
                    {node.name}
                </span>
                {node.depth === 0 && <span className="constellation-row-volume" aria-hidden="true">
                    <span style={{width: maxRoot > 0 ? `${(node.count / maxRoot) * 100}%` : 0}}/>
                </span>}
                <span className="constellation-row-count">{node.count}</span>
            </button>
        </li>
    )
}
