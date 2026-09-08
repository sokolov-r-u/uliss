import {useMemo, useState} from 'react'
import {Dialog, EmptyState, Icon, IconButton, Kicker, ListRow, TagDot} from '@uliss/design-system'
import {useNavigate} from 'react-router-dom'
import type {ConstellationTreeNode} from '../views/models'

function flatten(nodes: ConstellationTreeNode[]): ConstellationTreeNode[] {
    return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])])
}

function Tree({nodes, depth, selectedId, open, onToggle, onSelect}: {
    nodes: ConstellationTreeNode[]
    depth: number
    selectedId: string | null
    open: Set<string>
    onToggle: (id: string) => void
    onSelect: (id: string) => void
}) {
    return <>{nodes.map((node) => {
        const hasChildren = (node.children?.length ?? 0) > 0
        const expanded = open.has(node.id)
        const color = `hsl(${node.hue} 42% ${Math.round((node.lightness ?? 0.62) * 100)}%)`
        return <div key={node.id} role="treeitem" aria-expanded={hasChildren ? expanded : undefined}
                    aria-selected={node.id === selectedId}>
            <div className={node.id === selectedId ? 'tree-row selected' : 'tree-row'}
                 style={{paddingLeft: 12 + depth * 18}}>
                <IconButton s={44}
                            title={hasChildren ? `${expanded ? 'Collapse' : 'Expand'} ${node.label}` : `${node.label} has no sub-branches`}
                            disabled={!hasChildren} onClick={() => onToggle(node.id)}><Icon name="chevron" size={11}
                                                                                            rotate={expanded ? 0 : -90}/></IconButton>
                <button type="button" className="tree-select" onClick={() => onSelect(node.id)}>
                    <TagDot color={color}/><span>{node.label}</span><small>{node.count}</small>
                </button>
            </div>
            {hasChildren && expanded &&
                <div role="group"><Tree nodes={node.children ?? []} depth={depth + 1} selectedId={selectedId}
                                        open={open} onToggle={onToggle} onSelect={onSelect}/></div>}
        </div>
    })}</>
}

export function ConstellationsView({nodes, onStartChat, onOpenNote, onDelete}: {
    nodes: ConstellationTreeNode[]
    onStartChat?: () => void
    onOpenNote?: (id: string) => void
    onDelete?: (id: string) => void
}) {
    const all = useMemo(() => flatten(nodes), [nodes])
    const [open, setOpen] = useState(() => new Set(nodes.map((node) => node.id)))
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const selected = all.find((node) => node.id === selectedId) ?? null
    const deleting = all.find((node) => node.id === deleteId) ?? null

    if (nodes.length === 0) return <div className="product-view product-empty"><EmptyState title="No constellations yet"
                                                                                           body="As notes accumulate, Uliss gathers related ones into named branches you can rename and prune. Talk to it a while first."
                                                                                           action="Start a chat"
                                                                                           onAction={onStartChat}/>
    </div>

    return <div className="product-view constellation-layout">
        <section className="constellation-tree-panel">
            <div className="product-section-head"><Kicker size={9} spacing="3px"
                                                          color="var(--accent)">Constellations</Kicker><span>{all.length}</span>
            </div>
            <div role="tree" aria-label="Constellations"><Tree nodes={nodes} depth={0} selectedId={selectedId}
                                                               open={open}
                                                               onToggle={(id) => setOpen((current) => {
                                                                   const next = new Set(current);
                                                                   next.has(id) ? next.delete(id) : next.add(id);
                                                                   return next
                                                               })}
                                                               onSelect={(id) => setSelectedId(id)}/></div>
        </section>
        <aside className={selected ? 'branch-panel open' : 'branch-panel'} aria-label="Selected constellation">
            {selected && <>
                <header>
                    <div><Kicker size={9} spacing="2.5px" color="var(--accent)">Branch</Kicker><h2>{selected.label}</h2>
                    </div>
                    <IconButton title="Close branch" s={44} onClick={() => setSelectedId(null)}><Icon name="close"
                                                                                                      size={16}/></IconButton>
                </header>
                <p>{selected.count} notes in this branch. Deleting the branch keeps every note and removes only this
                    grouping.</p>
                <div className="branch-notes">{(selected.notes ?? []).map((note) => <ListRow key={note.id}
                                                                                             title={`${String(note.ordinal).padStart(3, '0')} · ${note.title}`}
                                                                                             date={note.date}
                                                                                             dots={false}
                                                                                             onClick={() => onOpenNote?.(note.id)}/>)}</div>
                <button type="button" className="branch-delete" onClick={() => setDeleteId(selected.id)}>Delete branch
                </button>
            </>}
        </aside>
        {deleting && (
            <Dialog danger title={`Delete “${deleting.label}”?`}
                    body="The branch goes. Every note stays, along with its other constellation links."
                    confirm="Delete branch" cancel="Keep branch" onCancel={() => setDeleteId(null)}
                    onConfirm={() => {
                        onDelete?.(deleting.id);
                        setDeleteId(null);
                        setSelectedId(null)
                    }}/>
        )}
    </div>
}

/** Production adapter: no constellation endpoint exists, so the typed view receives no nodes. */
export function ConstellationsPage() {
    const navigate = useNavigate()
    return <ConstellationsView nodes={[]} onStartChat={() => navigate('/chats')}/>
}
