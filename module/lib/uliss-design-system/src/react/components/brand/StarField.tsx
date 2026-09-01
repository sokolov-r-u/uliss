import React from 'react'

// Deep-field stars, seeded so the sky never reshuffles between renders. ~12% of
// stars twinkle on a 4–11s cycle; the rest are static. A vertical fade sinks the
// field into --bg-deep at the bottom so content stays legible. Purely
// decorative — the interactive constellation graph is a different thing.

export interface StarFieldProps {
    /** Unique per instance — it namespaces the SVG gradient ids. */
    id?: string
    /** Star count. 460 full-bleed; 180–240 behind a small panel. */
    count?: number
    seed?: number
    /** Viewbox aspect (w/h). 2 for a wide band, 0.55 for a phone screen. */
    aspect?: number
    /** Where the bottom fade starts / reaches full --bg-deep (0–1). */
    fadeStart?: number
    fadeEnd?: number
    opacity?: number
    /** Multiplies every star radius. */
    scale?: number
    nebula?: boolean
}

export function StarField({
                              id = 'sf',
                              count = 460,
                              seed = 7,
                              aspect = 2,
                              fadeStart = 0.42,
                              fadeEnd = 0.98,
                              opacity = 1,
                              scale = 1,
                              nebula = true,
                          }: StarFieldProps) {
    const W = 400
    const H = Math.round(400 / aspect)
    const stars = React.useMemo(() => {
        let a = ((seed * 16807) % 2147483647) || 12345
        const rr = () => (a = (a * 16807) % 2147483647) / 2147483647
        return Array.from({length: count}, () => {
            const b = Math.pow(rr(), 2.4)
            return {
                x: rr() * W,
                y: Math.pow(rr(), 1.2) * H,
                r: (0.13 + b * 0.42) * scale,
                o: 0.2 + b * 0.75,
                tw: rr() < 0.12,
                d: rr() * 9,
                p: 4 + rr() * 7,
            }
        })
    }, [count, seed, scale, H])
    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid slice"
            style={{width: '100%', height: '100%', opacity, display: 'block'}}
        >
            <defs>
                <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--bg-deep)" stopOpacity="0"/>
                    <stop offset={`${fadeStart * 100}%`} stopColor="var(--bg-deep)" stopOpacity="0.18"/>
                    <stop offset={`${fadeEnd * 100}%`} stopColor="var(--bg-deep)" stopOpacity="1"/>
                </linearGradient>
                <radialGradient id={`${id}-neb`}>
                    <stop offset="0%" stopColor="var(--sky-nebula)" stopOpacity="0.13"/>
                    <stop offset="100%" stopColor="var(--sky-nebula)" stopOpacity="0"/>
                </radialGradient>
            </defs>
            <g>
                {nebula && (
                    <React.Fragment>
                        <ellipse cx="140" cy={H * 0.28} rx="150" ry={H * 0.4} fill={`url(#${id}-neb)`}/>
                        <ellipse cx="310" cy={H * 0.5} rx="120" ry={H * 0.36} fill={`url(#${id}-neb)`}/>
                    </React.Fragment>
                )}
                {stars.map((s, i) => (
                    <circle
                        key={i}
                        cx={s.x}
                        cy={s.y}
                        r={s.r}
                        fill="var(--star-fill)"
                        opacity={s.o}
                        style={s.tw ? {animation: `uSkyTw ${s.p}s ease-in-out -${s.d}s infinite both`} : undefined}
                    />
                ))}
            </g>
            <rect width={W} height={H} fill={`url(#${id}-fade)`}/>
        </svg>
    )
}
