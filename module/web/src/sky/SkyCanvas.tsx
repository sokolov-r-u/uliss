import {type PointerEvent as ReactPointerEvent, useEffect, useMemo, useReducer, useRef, useState} from 'react'
import {applyPhysics, createLayout, type SimNode, type SkyLayout} from './skyLayout'
import {labelLines, nearestStars, segmentDistance, type SkyGraph, type SkyNode, type SkySubgraph, type SkyView, inBranch, subgraph, YOU_ID} from './skyModel'
import type {SkyPhysics, SkySettings} from './skySettings'
import {skyMemory} from './skyMemory'
import {SkyNamesMenu} from './SkyNamesMenu'

/**
 * The live sky: one SVG over the measured frame, drawn in screen space from the layout's world positions, so marks and
 * names keep their size at any zoom. Wheel and pinch zoom at the pointer, dragging the ground pans, dragging a star
 * moves it through the physics. Until the user takes the view over, the whole sky stays framed while it settles.
 */
export interface SkyCanvasProps {
    graph: SkyGraph
    /** What the current view shows; the layout always holds the whole graph, so a view only hides and shows. */
    sub: SkySubgraph
    view: SkyView
    filter: string | null
    settings: SkySettings
    physics: SkyPhysics
    selectedId: string | null
    onPickStar: (id: string) => void
    onFocus: (constellationId: string) => void
    /** YOU is the way out of Focus. */
    onExitFocus: () => void
    onSettings: (patch: Partial<SkySettings>) => void
    /** Leaves room on the right for the open panel. */
    panelOpen: boolean
    /** Bottom edge: the mode pair, Focus depth and the way out of (or back to) Focus. */
    footer: React.ReactNode
}

const Z_MIN = 0.05
const Z_MAX = 40
const FIT_MAX = 2.4
/** A press that travels less than this is a click, not a drag or a pan. */
const DRAG_START = 6
/** How close in screen px the mouse must be to an edge to light up its two ends. */
const EDGE_HIT = 6
/** The hit radius of a star or constellation, in screen px. */
const HIT_RADIUS = 13

interface ViewBox {
    s: number
    tx: number
    ty: number
}

interface Box {
    w: number
    h: number
}

/** Backdrop stars in unit space: part of the ground, so they never zoom. */
const BACKDROP = (() => {
    let seed = 99
    const next = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 4294967296
    }
    return Array.from({length: 120}, () => ({x: next(), y: next(), r: 0.25 + next() * 0.6, o: 0.08 + next() * 0.22}))
})()

export function SkyCanvas(props: SkyCanvasProps) {
    const {graph, sub, view, filter, settings, physics, selectedId, onPickStar, onFocus} = props
    const frameRef = useRef<HTMLDivElement>(null)
    const [box, setBox] = useState<Box | null>(null)
    const boxRef = useRef<Box>({w: 360, h: 680})
    const layoutRef = useRef<SkyLayout | null>(null)
    // coming back to the sky restores how it was left (skyMemory)
    const memory = skyMemory.canvas
    const positions = useRef(memory?.positions ?? new Map<string, { x: number; y: number }>())
    const viewRef = useRef<ViewBox>(memory?.viewBox ?? {s: 1, tx: 180, ty: 340})
    const fitScale = useRef(memory?.fitScale ?? 1)
    const touched = useRef(memory?.touched ?? false)
    const [hint, setHint] = useState(!memory?.touched)
    const [, repaint] = useReducer((x: number) => x + 1, 0)
    const [reveal, setReveal] = useState<number | null>(null)
    const [namesOpen, setNamesOpen] = useState(false)
    // the mouse over the sky: names the star under it and the ones around it
    const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
    const all = useMemo(() => subgraph(graph, 'full'), [graph])
    const visible = useMemo(() => new Set(sub.nodes.map((n) => n.id)), [sub])
    const visibleEdges = useMemo(() => new Set(sub.edges.map((e) => `${e.source}>${e.target}>${e.kind}`)), [sub])

    // measured frame → the SVG's own pixel box
    useEffect(() => {
        const el = frameRef.current
        if (!el) return
        const read = () => {
            const w = el.clientWidth
            const h = el.clientHeight
            if (w < 60 || h < 60) return
            boxRef.current = {w, h}
            setBox((b) => b && Math.abs(b.w - w) < 2 && Math.abs(b.h - h) < 2 ? b : {w, h})
        }
        read()
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(read)
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    const fit = () => {
        const layout = layoutRef.current
        if (!layout || layout.nodes.length === 0) return
        const {w, h} = boxRef.current
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
        for (const n of layout.nodes) {
            x0 = Math.min(x0, n.x)
            x1 = Math.max(x1, n.x)
            y0 = Math.min(y0, n.y)
            y1 = Math.max(y1, n.y)
        }
        // Names stick out of the node centres by a constant screen margin.
        const padX = Math.min(w * 0.2, 120)
        const padY = Math.min(h * 0.14, 70)
        const cw = x1 - x0
        const ch = y1 - y0
        const s = Math.min(FIT_MAX, cw > 0 ? (w - 2 * padX) / cw : FIT_MAX, ch > 0 ? (h - 2 * padY) / ch : FIT_MAX)
        const scale = Math.max(Z_MIN, s)
        fitScale.current = scale
        viewRef.current = {s: scale, tx: w / 2 - scale * (x0 + x1) / 2, ty: h / 2 - scale * (y0 + y1) / 2}
    }

    // one layout of the whole graph for every view; positions survive data updates
    useEffect(() => {
        const previous = positions.current
        const layout = createLayout({
            sub: all,
            physics,
            starCount: graph.starCount,
            previous,
        })
        layoutRef.current = layout
        if (!touched.current) fit()
        repaint()
        layout.simulation.on('tick', () => {
            if (!touched.current) fit()
            repaint()
        })
        // new stars get room; a restored or unchanged sky only breathes
        const fresh = layout.nodes.some((n) => !previous.has(n.id))
        layout.simulation.alpha(previous.size > 0 && fresh ? 0.3 : previous.size > 0 ? 0.02 : 0.06).restart()
        return () => {
            layout.simulation.stop()
            positions.current = new Map(layout.nodes.map((n) => [n.id, {x: n.x, y: n.y}]))
        }
        // physics is applied live below; rebuilding on it would throw the layout away
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [all, graph.starCount])

    // declared after the layout effect, so on unmount it runs after the layout has saved its positions
    useEffect(() => () => {
        skyMemory.canvas = {
            viewBox: viewRef.current,
            fitScale: fitScale.current,
            touched: touched.current,
            positions: positions.current,
        }
    }, [])

    const physicsFirst = useRef(true)
    useEffect(() => {
        if (physicsFirst.current) {
            physicsFirst.current = false
            return
        }
        if (layoutRef.current) applyPhysics(layoutRef.current, physics)
    }, [physics])

    // a resize re-frames the sky until the user has moved it
    useEffect(() => {
        if (box && !touched.current) {
            fit()
            repaint()
        }
    }, [box])

    // Full · run — the sky grows back in the order it grew; any tap stops it
    const order = useMemo(() => [...sub.nodes].sort((a, b) => a.order - b.order).map((n) => n.id), [sub])
    const rank = useMemo(() => new Map(order.map((id, i) => [id, i])), [order])
    useEffect(() => {
        if (reveal == null) return
        if (reveal >= order.length) {
            setReveal(null)
            return
        }
        const step = Math.max(20, Math.min(110, 8000 / order.length))
        const timer = setTimeout(() => setReveal((value) => value == null ? null : value + 1), step)
        return () => clearTimeout(timer)
    }, [reveal, order.length])
    const shown = (id: string) => reveal == null || (rank.get(id) ?? 0) <= reveal

    const takeOver = () => {
        touched.current = true
        setHint(false)
    }

    const zoomAt = (px: number, py: number, factor: number) => {
        takeOver()
        const v = viewRef.current
        const s = Math.max(Z_MIN, Math.min(Z_MAX, v.s * factor))
        if (s === v.s) return
        const gx = (px - v.tx) / v.s
        const gy = (py - v.ty) / v.s
        viewRef.current = {s, tx: px - s * gx, ty: py - s * gy}
        repaint()
    }
    const zoomCentre = (factor: number) => zoomAt(boxRef.current.w / 2, boxRef.current.h / 2, factor)
    const reset = () => {
        takeOver()
        fit()
        repaint()
    }

    useEffect(() => {
        const frame = frameRef.current
        if (!frame) return
        const onWheel = (event: WheelEvent) => {
            if ((event.target as Element | null)?.closest('[data-sky-ui]')) return
            event.preventDefault()
            const rect = frame.getBoundingClientRect()
            const factor = event.ctrlKey ? Math.exp(-event.deltaY * 0.01) : Math.exp(-Math.sign(event.deltaY) * 0.2)
            zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor)
        }
        frame.addEventListener('wheel', onWheel, {passive: false})
        return () => frame.removeEventListener('wheel', onWheel)
        // zoomAt reads refs only
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── pointers: pan on the ground, drag a star, pinch with two fingers ──
    const pointers = useRef(new Map<number, { x: number; y: number }>())
    const gesture = useRef<
        | { kind: 'pan'; x: number; y: number; moved: boolean }
        | { kind: 'drag'; node: SimNode; x0: number; y0: number; moved: boolean; pinned: boolean }
        | { kind: 'pinch'; dist: number; s: number }
        | null>(null)
    const suppressClick = useRef(false)

    const local = (event: { clientX: number; clientY: number }) => {
        const rect = frameRef.current!.getBoundingClientRect()
        return {x: event.clientX - rect.left, y: event.clientY - rect.top}
    }
    const pinchOf = () => {
        const [a, b] = [...pointers.current.values()]
        return {dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}}
    }

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        const target = event.target as Element
        if (target.closest('[data-sky-ui]')) return
        suppressClick.current = false
        if (reveal != null) setReveal(null)
        pointers.current.set(event.pointerId, local(event))
        if (pointers.current.size === 2) {
            gesture.current = {kind: 'pinch', dist: pinchOf().dist, s: viewRef.current.s}
            takeOver()
            return
        }
        const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id')
        const node = nodeId ? layoutRef.current?.byId.get(nodeId) : undefined
        const p = local(event)
        gesture.current = node
            ? {kind: 'drag', node, x0: p.x, y0: p.y, moved: false, pinned: node.fx != null}
            : {kind: 'pan', x: p.x, y: p.y, moved: false}
    }

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse') {
            setPointer((event.target as Element).closest('[data-sky-ui]') ? null : local(event))
        }
        if (!pointers.current.has(event.pointerId)) return
        pointers.current.set(event.pointerId, local(event))
        const g = gesture.current
        const p = local(event)
        if (!g) return
        if (g.kind === 'pinch') {
            if (pointers.current.size < 2) return
            const {dist, mid} = pinchOf()
            zoomAt(mid.x, mid.y, g.s * dist / g.dist / viewRef.current.s)
            return
        }
        if (g.kind === 'drag') {
            if (!g.moved && Math.hypot(p.x - g.x0, p.y - g.y0) < DRAG_START) return
            if (!g.moved) {
                g.moved = true
                takeOver()
                event.currentTarget.setPointerCapture(event.pointerId)
            }
            const v = viewRef.current
            g.node.fx = (p.x - v.tx) / v.s
            g.node.fy = (p.y - v.ty) / v.s
            layoutRef.current?.simulation.alphaTarget(0.3).restart()
            repaint()
            return
        }
        if (!g.moved && Math.hypot(p.x - g.x, p.y - g.y) < DRAG_START) return
        if (!g.moved) {
            g.moved = true
            takeOver()
            event.currentTarget.setPointerCapture(event.pointerId)
        }
        const v = viewRef.current
        viewRef.current = {...v, tx: v.tx + p.x - g.x, ty: v.ty + p.y - g.y}
        g.x = p.x
        g.y = p.y
        repaint()
    }

    const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        pointers.current.delete(event.pointerId)
        const g = gesture.current
        if (g?.kind === 'drag' && g.moved) {
            suppressClick.current = true
            if (!g.pinned) {
                g.node.fx = null
                g.node.fy = null
            }
            // let go and the sky settles back; a released star must not freeze the simulation
            layoutRef.current?.simulation.alphaTarget(0).alpha(0.5).restart()
        } else if (g?.kind === 'pan' && g.moved) {
            suppressClick.current = true
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
        gesture.current = pointers.current.size === 1 && g?.kind === 'pinch'
            ? {kind: 'pan', ...[...pointers.current.values()][0], moved: true}
            : null
    }

    const activate = (node: SkyNode) => {
        if (suppressClick.current) {
            suppressClick.current = false
            return
        }
        if (node.kind === 'constellation') onFocus(node.id)
        else if (node.kind === 'star') onPickStar(node.id)
    }

    // ── paint ──
    const layout = layoutRef.current
    const {w, h} = box ?? boxRef.current
    const v = viewRef.current
    const sx = (n: SimNode) => n.x * v.s + v.tx
    const sy = (n: SimNode) => n.y * v.s + v.ty
    const mono = settings.colour === 'mono'
    const tint = (node: SkyNode) => mono ? 'var(--accent-2)' : node.colors[0] ?? 'var(--cream)'
    const off = (node: SkyNode) => filter != null && !inBranch(graph, node, filter)
    const zoom = touched.current ? v.s / (fitScale.current || 1) : 1
    const labelOf = (node: SkyNode): number => {
        if (settings.labels === 'off') return 0
        if (settings.labels === 'always' || view === 'focus') return 1
        if (node.kind === 'constellation') return node.depth <= 1 || w >= 700 || zoom > 1.25 * physics.labelGain ? 1 : 0
        // names follow the room, not the breakpoint: a wide sky names every star, a narrow one waits for zoom
        const room = w >= 980 ? 0 : w >= 700 ? 0.8 : 1.7
        const threshold = (1 + room) * physics.labelGain
        return Math.max(0, Math.min(1, (zoom - threshold) / 0.5 + 0.05))
    }
    const radiusOf = (node: SkyNode) => node.kind === 'constellation'
        ? (node.depth === 1 ? 5.6 : node.depth === 2 ? 4.6 : 3.9) * physics.constellationScale
        : 3.2 * physics.starScale
    const you = layout?.byId.get(YOU_ID)
    const cx = you ? sx(you) : w / 2
    const nodes = (layout?.nodes ?? []).filter((n) => visible.has(n.id) && shown(n.id))
    // the star under the mouse and the ones around it are always named
    const stars = nodes.filter((n) => n.node.kind === 'star')
    const near = pointer && settings.nearCount > 0
        ? new Set(nearestStars(stars.map((n) => ({id: n.id, x: sx(n), y: sy(n)})), pointer, settings.nearCount,
            physics.nearRadius))
        : new Set<string>()
    const hovered = pointer ? nearestStars(nodes.filter((n) => n.node.kind !== 'you')
        .map((n) => ({id: n.id, x: sx(n), y: sy(n)})), pointer, 1, HIT_RADIUS)[0] : undefined
    // the mouse on an edge (and not on a node) lights up the two nodes it joins
    const edgeEnds = new Set<string>()
    if (pointer && !hovered && layout) {
        let best = EDGE_HIT
        let ends: [string, string] | null = null
        for (const link of layout.links) {
            const a = link.source
            const b = link.target
            if (!visibleEdges.has(`${a.id}>${b.id}>${link.kind}`) || !shown(a.id) || !shown(b.id)) continue
            const d = segmentDistance(pointer, {x: sx(a), y: sy(a)}, {x: sx(b), y: sy(b)})
            if (d <= best) {
                best = d
                ends = [a.id, b.id]
            }
        }
        ends?.forEach((id) => edgeEnds.add(id))
    }
    const lit = (id: string) => id === hovered || edgeEnds.has(id)

    return (
        <div ref={frameRef} className={props.panelOpen ? 'sky-frame panel-open' : 'sky-frame'}
             onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
             onPointerLeave={() => setPointer(null)}
             onPointerCancel={onPointerUp} onDoubleClick={(e) => {
            if (!(e.target as Element).closest('[data-sky-ui]')) reset()
        }}>
            <svg className="sky-svg" viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" role="group"
                 aria-label="Sky map">
                <defs>
                    <radialGradient id="sky-core" cx="50%" cy="50%" r="62%">
                        <stop offset="0%" stopColor="var(--sky-glow-a)"/>
                        <stop offset="42%" stopColor="var(--sky-glow-b)"/>
                        <stop offset="100%" stopColor="transparent"/>
                    </radialGradient>
                </defs>
                <rect width={w} height={h} fill="var(--sky-bg)"/>
                <rect width={w} height={h} fill="url(#sky-core)"/>
                {BACKDROP.map((star, i) => <circle key={i} cx={star.x * w} cy={star.y * h} r={star.r}
                                                   fill="var(--cream)" opacity={star.o}/>)}

                {layout?.links.map((link, i) => {
                    const a = link.source
                    const b = link.target
                    if (!visibleEdges.has(`${a.id}>${b.id}>${link.kind}`) || !shown(a.id) || !shown(b.id)) return null
                    if (link.kind === 'secondary') {
                        return <line key={i} x1={sx(a)} y1={sy(a)} x2={sx(b)} y2={sy(b)} stroke={tint(a.node)}
                                     strokeWidth={0.8}
                                     strokeDasharray={settings.secondaryStyle === 'dashed' ? '2 4' : undefined}
                                     opacity={off(a.node) && off(b.node) ? 0.05 : 0.32}/>
                    }
                    const branch = b.node.kind === 'constellation'
                    const dimmed = off(b.node)
                    return <g key={i}>
                        <line x1={sx(a)} y1={sy(a)} x2={sx(b)} y2={sy(b)} stroke="var(--cream)"
                              strokeWidth={branch ? 0.9 : 0.7} opacity={dimmed ? 0.05 : branch ? 0.3 : 0.18}/>
                        {settings.midStars && !branch && !dimmed &&
                            <circle cx={(sx(a) + sx(b)) / 2} cy={(sy(a) + sy(b)) / 2} r={0.8} fill="var(--cream)"
                                    opacity={0.32}/>}
                    </g>
                })}

                {nodes.map((n) => {
                    const node = n.node
                    if (node.kind === 'you') return null
                    const x = sx(n)
                    const y = sy(n)
                    const r = radiusOf(node)
                    const isConstellation = node.kind === 'constellation'
                    const dimmed = off(node)
                    const pickable = !dimmed && true
                    const name = lit(n.id) || near.has(n.id) ? 1 : labelOf(node)
                    const outward = x >= cx ? 1 : -1
                    const colour = tint(node)
                    const sectors = !mono && settings.mixColours && node.colors.length > 1 ? node.colors : null
                    return <g key={n.id} data-node-id={n.id} className={pickable ? 'sky-node pickable' : 'sky-node'}
                              opacity={dimmed ? isConstellation ? 0.16 : 0.14 : 1}
                              role={pickable ? 'button' : undefined} tabIndex={pickable ? 0 : undefined}
                              aria-label={pickable ? isConstellation ? `Focus on ${node.label}` : node.label : undefined}
                              onClick={pickable ? () => activate(node) : undefined}
                              onKeyDown={pickable ? (event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      activate(node)
                                  }
                              } : undefined}>
                        {pickable && <circle cx={x} cy={y} r={HIT_RADIUS} fill="transparent"/>}
                        {(n.id === selectedId || edgeEnds.has(n.id)) &&
                            <circle cx={x} cy={y} r={r + 8} fill="none" stroke="var(--accent)"
                                    strokeWidth={1} opacity={n.id === selectedId ? 1 : 0.7}/>}
                        {settings.glow && <circle cx={x} cy={y} r={r * (isConstellation ? 2 : 2.9)} fill={colour}
                                                  opacity={isConstellation ? 0.09 : 0.14}/>}
                        {isConstellation
                            ? <circle cx={x} cy={y} r={r} fill="none" stroke={colour}
                                      strokeWidth={node.depth === 1 ? 1.3 : 1}/>
                            : sectors ? <StarSectors x={x} y={y} r={r} colors={sectors}/>
                                : <circle cx={x} cy={y} r={r} fill={colour}/>}
                        {name > 0.001 && (() => {
                            const size = (isConstellation ? node.depth === 1 ? 10 : 9 : 9.5) * physics.labelScale
                            const lines = isConstellation ? [node.label] : labelLines(node.label)
                            const lx = x + outward * (r + 5)
                            // two lines sit centred on the star, one line on its baseline
                            const top = y + 3.2 - (lines.length - 1) * size * 0.6
                            return <text x={lx} y={top} textAnchor={outward > 0 ? 'start' : 'end'} opacity={name}
                                         className={`${isConstellation ? 'sky-name constellation' : 'sky-name'}${lit(n.id) ? ' hovered' : ''}`}
                                         fontSize={size}>
                                {lines.map((line, i) => <tspan key={i} x={lx} dy={i === 0 ? 0 : size * 1.2}>{line}</tspan>)}
                            </text>
                        })()}
                    </g>
                })}

                {you && <YouMark x={sx(you)} y={sy(you)} mark={settings.centerMark}
                                 onExit={view === 'focus' ? () => {
                                     // a pan that started on YOU is not a click
                                     if (suppressClick.current) suppressClick.current = false
                                     else props.onExitFocus()
                                 } : undefined}/>}
            </svg>

            <div className="sky-controls" data-sky-ui="">
                <button type="button" className={namesOpen ? 'sky-control small on' : 'sky-control small'}
                        title="Names" aria-expanded={namesOpen} onClick={() => setNamesOpen((open) => !open)}>Aa
                </button>
                <button type="button" className="sky-control small"
                        title={reveal == null ? 'Replay how the sky grew' : 'Stop the replay'}
                        onClick={() => setReveal((value) => value == null ? 0 : null)}>{reveal == null ? 'run' : 'stop'}</button>
                <button type="button" className="sky-control" title="Zoom in" onClick={() => zoomCentre(1.45)}>+</button>
                <button type="button" className="sky-control" title="Zoom out"
                        onClick={() => zoomCentre(1 / 1.45)}>−
                </button>
                <button type="button" className="sky-control small" title="Show the whole sky" onClick={reset}>fit</button>
                <span className="sky-zoom">{zoom.toFixed(1)}×</span>
            </div>
            {namesOpen && <SkyNamesMenu settings={settings} onSettings={props.onSettings}
                                        onClose={() => setNamesOpen(false)}/>}
            <div className="sky-footer" data-sky-ui="">{props.footer}</div>
            {hint && !namesOpen && <div className="sky-hint"><span>scroll to zoom · drag to pan</span></div>}
        </div>
    )
}

/** A star in several constellations split into equal sectors, main first from the top, clockwise. */
function StarSectors({x, y, r, colors}: { x: number; y: number; r: number; colors: string[] }) {
    const step = 2 * Math.PI / colors.length
    return <g>{colors.map((colour, i) => {
        const a0 = -Math.PI / 2 + i * step
        const a1 = a0 + step
        const d = `M${x} ${y} L${x + r * Math.cos(a0)} ${y + r * Math.sin(a0)} `
            + `A${r} ${r} 0 ${step > Math.PI ? 1 : 0} 1 ${x + r * Math.cos(a1)} ${y + r * Math.sin(a1)} Z`
        return <path key={i} d={d} fill={colour}/>
    })}</g>
}

/** YOU, the centre of every view; in Focus it is the way out. */
function YouMark({x, y, mark, onExit}: { x: number; y: number; mark: SkySettings['centerMark']; onExit?: () => void }) {
    const k = 1
    return <g className={onExit ? 'sky-you exit' : 'sky-you'}
              role={onExit ? 'button' : undefined} tabIndex={onExit ? 0 : undefined}
              aria-label={onExit ? 'Exit focus' : undefined} aria-hidden={onExit ? undefined : true}
              onClick={onExit} onKeyDown={onExit ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onExit()
        }
    } : undefined}>
        {onExit && <title>Exit focus</title>}
        <circle cx={x} cy={y} r={30 * k} fill="color-mix(in srgb, var(--accent-2) 10%, transparent)"/>
        <circle cx={x} cy={y} r={17 * k} fill="none" stroke="var(--accent-2)" strokeWidth={0.8} opacity={0.55}/>
        {mark === 'star'
            ? <path fill="var(--accent-2)" d={`M${x} ${y - 16 * k} L${x + 4.5 * k} ${y - 4.5 * k} L${x + 16 * k} ${y} `
                + `L${x + 4.5 * k} ${y + 4.5 * k} L${x} ${y + 16 * k} L${x - 4.5 * k} ${y + 4.5 * k} L${x - 16 * k} ${y} `
                + `L${x - 4.5 * k} ${y - 4.5 * k} Z`}/>
            : <g fill="var(--accent-2)">
                <path d={`M${x - 13 * k} ${y + 8 * k} Q${x} ${y + 14 * k} ${x + 13 * k} ${y + 8 * k} L${x + 9 * k} `
                    + `${y + 8 * k} Q${x} ${y + 11.5 * k} ${x - 9 * k} ${y + 8 * k} Z`}/>
                <rect x={x - 0.9 * k} y={y - 15 * k} width={1.8 * k} height={23 * k}/>
                <path d={`M${x} ${y - 13.5 * k} L${x + 10.5 * k} ${y + 6 * k} L${x} ${y + 6 * k} Z`} opacity={0.92}/>
            </g>}
        <text x={x} y={y + 34 * k} textAnchor="middle" className="sky-you-label" fontSize={10 * k}>YOU
        </text>
    </g>
}
