import {constellationColor, ConstellationColorEditor, type ConstellationLightness, ConstellationPicker, TagDot, useMessages} from '@uliss/design-system'
import {listConstellationNotes} from '../notes/noteApi'
import {
    type ConstellationNode,
    type ConstellationTree,
    descendantIds,
    pickerItems,
} from './constellationTree'
import {NotesHere} from './NotesHere'
import {constellationsMessages} from './constellations.messages'

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
    onOpenNote: (noteId: string) => void
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
                                       onOpenNote,
                                   }: ConstellationPanelProps) {
    const t = useMessages(constellationsMessages)
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
                    {t.stars(node.count)}
                    {node.children.length > 0 && ` · ${t.subConstellations(node.children.length)}`}
                </p>
                <div className="constellation-panel-actions">
                    <button type="button" disabled={busy} onClick={onRename}>{t.renameAction}</button>
                    <button type="button" disabled={busy} aria-expanded={tool === 'colour'}
                            onClick={() => toggle('colour')}>{t.changeColour}
                    </button>
                    <button type="button" className="dashed" disabled={busy} onClick={onCreateChild}>
                        {t.newSub}
                    </button>
                    <button type="button" disabled={busy} aria-expanded={tool === 'move'}
                            onClick={() => toggle('move')}>{t.move}
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
                                     label={t.moveToPicker} action={t.moveToNamed} busy={busy}
                                     lead={isRoot ? undefined : {label: t.makeRoot, onSelect: () => onMove(null)}}
                                     onPick={(id) => onMove(id)} onClose={() => onTool(null)}/>
            </div>}
            <NotesHere id={node.id} load={listConstellationNotes} onOpen={onOpenNote}
                       empty={t.noNotesHere}
                       deeper={below > 0 ? t.deeper(t.stars(below), deeperNames(node)) : null}/>
            <section className="constellation-panel-foot">
                <p>{isRoot
                    ? t.rootColour
                    : t.inheritedColour(root.name)}</p>
                <button type="button" className="constellation-panel-delete" disabled={busy} onClick={onDelete}>
                    {t.deleteConstellation}
                </button>
            </section>
        </div>
    )
}

/** The children that hold notes; all of them when the counts disagree. */
function deeperNames(node: ConstellationNode): string {
    const holding = node.children.filter((child) => child.count > 0)
    return (holding.length > 0 ? holding : node.children).map((child) => child.name).join(', ')
}
