import {
    ConstellationColorEditor,
    type ConstellationLightness,
    ConstellationPicker,
    type ConstellationPickerItem,
    constellationColor,
    Kicker,
    TagDot,
} from '@uliss/design-system'
import {type ConstellationNode, type ConstellationTree, descendantIds, plural} from './constellationTree'

export type PanelTool = 'colour' | 'move' | null

export interface ConstellationPanelProps {
    node: ConstellationNode
    tree: ConstellationTree
    tool: PanelTool
    /** A change from this panel is being stored. */
    busy: boolean
    /** The last failed change from this panel. */
    error: string | null
    onTool: (tool: PanelTool) => void
    onRename: () => void
    onCreateChild: () => void
    onDelete: () => void
    onRecolor: (change: { hue: number } | { lightness: ConstellationLightness }) => void
    onMove: (parentId: string | null) => void
}

/** The selected branch: path, name, counts, its actions, the inline colour editor and move picker, Notes here. */
export function ConstellationPanel({
                                       node,
                                       tree,
                                       tool,
                                       busy,
                                       error,
                                       onTool,
                                       onRename,
                                       onCreateChild,
                                       onDelete,
                                       onRecolor,
                                       onMove,
                                   }: ConstellationPanelProps) {
    const isRoot = node.depth === 0
    const root = node.ancestors[0] ?? node
    const below = node.count - node.ownCount
    const toggle = (next: Exclude<PanelTool, null>) => onTool(tool === next ? null : next)
    return (
        <div className="constellation-panel">
            <div className="constellation-panel-head">
                {!isRoot && <p className="constellation-panel-path">
                    {node.ancestors.map((ancestor) => ancestor.name).join(' › ')} › <span>{node.name}</span>
                </p>}
                <h2 className="constellation-panel-name">
                    <TagDot color={constellationColor(node.hue, node.lightness)} size={11}/>
                    <span>{node.name}</span>
                </h2>
                <p className="constellation-panel-meta">
                    {plural(node.count, 'star', 'stars')}
                    {node.children.length > 0 && ` · ${plural(node.children.length, 'sub-constellation', 'sub-constellations')}`}
                </p>
                <div className="constellation-panel-actions">
                    <button type="button" disabled={busy} onClick={onRename}>Rename</button>
                    <button type="button" disabled={busy} aria-expanded={tool === 'colour'}
                            onClick={() => toggle('colour')}>Change colour
                    </button>
                    <button type="button" className="dashed" disabled={busy} onClick={onCreateChild}>
                        + New sub-constellation
                    </button>
                    <button type="button" disabled={busy} aria-expanded={tool === 'move'}
                            onClick={() => toggle('move')}>Move
                    </button>
                </div>
                {error && <p className="constellation-panel-error" role="alert">{error}</p>}
            </div>
            {tool === 'colour' && (isRoot
                ? <ConstellationColorEditor key={`${node.id}-hue`} mode="hue" name={node.name} hue={node.hue}
                                            busy={busy} onSave={(hue) => onRecolor({hue})}
                                            onClose={() => onTool(null)}/>
                : <ConstellationColorEditor key={`${node.id}-lightness`} mode="lightness" name={node.name}
                                            hue={node.hue} lightness={node.lightness} rootName={root.name}
                                            busy={busy} onSave={(lightness) => onRecolor({lightness})}
                                            onClose={() => onTool(null)}/>)}
            {tool === 'move' && <div className="constellation-panel-move">
                <ConstellationPicker key={node.id} items={pickerItems(tree)} exclude={[node.id, ...descendantIds(node)]}
                                     label="Move to…"
                                     lead={isRoot ? undefined : {label: 'Make it a root', onSelect: () => onMove(null)}}
                                     onPick={(id) => onMove(id)} onClose={() => onTool(null)}/>
            </div>}
            <section className="constellation-panel-notes">
                <Kicker size={9} spacing="3px" color="var(--text-faint)">Notes here</Kicker>
                <p>No notes here yet.</p>
                {below > 0 && <p>Plus {plural(below, 'star', 'stars')} deeper
                    in {node.children.map((child) => child.name).join(', ')}.</p>}
            </section>
            <section className="constellation-panel-foot">
                <p>{isRoot
                    ? 'A root owns its colour. Everything below it plays with lightness.'
                    : `Colour comes from ${root.name}; this level chooses how light it sits.`}</p>
                <button type="button" className="constellation-panel-delete" disabled={busy} onClick={onDelete}>
                    Delete constellation
                </button>
            </section>
        </div>
    )
}

function pickerItems(tree: ConstellationTree): ConstellationPickerItem[] {
    return tree.flat.map((node) => ({
        id: node.id,
        name: node.name,
        depth: node.depth,
        path: node.ancestors.map((ancestor) => ancestor.name),
        color: constellationColor(node.hue, node.lightness),
        count: node.count,
    }))
}
