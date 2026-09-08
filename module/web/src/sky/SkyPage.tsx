import {useMemo, useRef, useState} from 'react'
import {EmptyState, Icon, IconButton, Kicker, Select, StepControl} from '@uliss/design-system'
import type {SkyGraphModel, SkyGraphNode} from '../views/models'

const SEEDS = [{left: '34%', top: '33%', r: 4, on: true}, {left: '63%', top: '24%', r: 3, on: false}]

export function SkyView({model, disabled = false}: { model: SkyGraphModel | null; disabled?: boolean }) {
    const [scale, setScale] = useState(1)
    const [pan, setPan] = useState({x: 0, y: 0})
    const [mode, setMode] = useState('skeleton')
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [filter, setFilter] = useState<string | null>(null)
    const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
    const byId = useMemo(() => new Map(model?.nodes.map((node) => [node.id, node]) ?? []), [model])
    const selected = selectedId ? byId.get(selectedId) ?? null : null
    const constellations = model?.nodes.filter((node) => node.kind === 'constellation') ?? []

    if (!model || model.nodes.length < 3) return <div className="product-view product-empty sky-empty-view">
        {SEEDS.map((seed, index) => <span key={index} className="sky-seed" style={{
            left: seed.left,
            top: seed.top,
            width: seed.r * 2,
            height: seed.r * 2,
            background: seed.on ? 'var(--accent)' : 'var(--cream-dim)',
            boxShadow: seed.on ? '0 0 20px 2px var(--accent-glow)' : '0 0 14px color-mix(in srgb, var(--cream-dim) 40%, transparent)'
        }}/>)}
        <EmptyState title="Two stars are not a sky"
                    body="Uliss draws the map once you have three notes. Start a few chats, then press Summarize — it turns them into notes right away."/>
    </div>

    const visible = (node: SkyGraphNode) => !filter || node.id === filter || node.kind === 'you' || model.edges.some((edge) => (edge.from === filter && edge.to === node.id) || (edge.to === filter && edge.from === node.id))
    const zoom = (delta: number) => setScale((value) => Math.min(2.5, Math.max(0.6, value + delta)))

    return <div className="product-view sky-view">
        <div className="sky-toolbar">
            <Select aria-label="Filter by constellation" value={filter} onChange={setFilter} disabled={disabled}
                    placeholder="All constellations"
                    options={constellations.map((node) => ({value: node.id, label: node.label}))}/>
            <StepControl label="Sky mode" value={mode} disabled={disabled} onPick={setMode}
                         steps={[{id: 'skeleton', label: 'Skeleton'}, {id: 'focus', label: 'Focus'}, {
                             id: 'full',
                             label: 'Full'
                         }]}/>
        </div>
        <div className="sky-canvas">
            <svg viewBox="0 0 1000 700" role="img" aria-label="Constellation map"
                 onWheel={(event) => {
                     event.preventDefault();
                     zoom(event.deltaY < 0 ? 0.1 : -0.1)
                 }}
                 onPointerDown={(event) => {
                     if (!disabled) {
                         drag.current = {x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y};
                         event.currentTarget.setPointerCapture(event.pointerId)
                     }
                 }}
                 onPointerMove={(event) => {
                     if (drag.current) setPan({
                         x: drag.current.panX + event.clientX - drag.current.x,
                         y: drag.current.panY + event.clientY - drag.current.y
                     })
                 }}
                 onPointerUp={() => {
                     drag.current = null
                 }}>
                <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
                    {model.edges.map((edge, index) => {
                        const from = byId.get(edge.from);
                        const to = byId.get(edge.to);
                        return from && to ?
                            <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                                  className={edge.secondary ? 'sky-edge secondary' : 'sky-edge'}/> : null
                    })}
                    {model.nodes.map((node) => <g key={node.id} role="button" tabIndex={0} aria-label={node.label}
                                                  className={visible(node) ? `sky-node ${node.kind}` : `sky-node ${node.kind} muted`}
                                                  onClick={() => !disabled && setSelectedId(node.id)}
                                                  onKeyDown={(event) => {
                                                      if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                                                          event.preventDefault();
                                                          setSelectedId(node.id)
                                                      }
                                                  }}>
                        <circle cx={node.x} cy={node.y} r={node.radius}
                                fill={node.color ?? (node.kind === 'you' ? 'var(--accent-2)' : 'var(--cream)')}/>
                        {mode !== 'full' && <text x={node.x + node.radius + 7} y={node.y + 4}>{node.label}</text>}
                    </g>)}
                </g>
            </svg>
            <div className="sky-controls">
                <IconButton title="Zoom out" disabled={disabled || scale <= 0.6} onClick={() => zoom(-0.2)}><span
                    aria-hidden>−</span></IconButton>
                <Kicker size={9} spacing="1px" color="var(--text-faint)">{Math.round(scale * 100)}%</Kicker>
                <IconButton title="Zoom in" disabled={disabled || scale >= 2.5} onClick={() => zoom(0.2)}><span
                    aria-hidden>+</span></IconButton>
                <IconButton title="Reset view" disabled={disabled} onClick={() => {
                    setScale(1);
                    setPan({x: 0, y: 0})
                }}><Icon name="collapse" size={15}/></IconButton>
            </div>
            {selected && <aside className="sky-node-panel">
                <header><Kicker size={9} spacing="2.5px" color="var(--accent)">{selected.kind}</Kicker><IconButton
                    title="Close details" onClick={() => setSelectedId(null)}><Icon name="close"
                                                                                    size={15}/></IconButton></header>
                <h2>{selected.label}</h2><p>This panel presents graph context only. Runtime actions remain unavailable
                until graph data has a backend contract.</p></aside>}
        </div>
    </div>
}

/** Production adapter: graph data has no backend contract, so the renderer receives no model. */
export function SkyPage() {
    return <SkyView model={null} disabled/>
}
