import React from 'react'

// The complete Uliss glyph set. Mono line drawing, 24×24 box, currentColor,
// strokeWidth 1.4–1.8, square caps by default — round caps only where a stroke
// ends in open air (mic, chevrons, search tail). No icon font, no emoji, no
// external library.

export type IconName =
    | 'menu' | 'close' | 'journal' | 'arrowUp' | 'arrowIn' | 'arrowOut' | 'sort'
    | 'plus' | 'star' | 'pulse' | 'noteDoc' | 'chatBubble' | 'filter' | 'tick'
    | 'chevron' | 'caret' | 'search' | 'summary' | 'cal' | 'gear' | 'collapse'
    | 'panelRight' | 'dots' | 'node' | 'constellation' | 'mic' | 'tag'

interface Glyph {
    d?: string
    sw?: number
    cap?: 'butt' | 'round' | 'square'
    join?: 'miter' | 'round' | 'bevel'
    circle?: [number, number, number]
    circles?: [number, number, number][]
    rect?: [number, number, number, number]
    pane?: [number, number, number, number]
    dot?: [number, number, number]
    dots?: [number, number][]
    extra?: string
    mic?: boolean
}

const GLYPHS: Record<IconName, Glyph> = {
    menu: {d: 'M4 7h16M4 12h16M4 17h10', sw: 1.6},
    close: {d: 'M6 6l12 12M18 6L6 18', sw: 1.6},
    journal: {d: 'M4 6h16M4 12h16M4 18h11', sw: 1.5},
    arrowUp: {d: 'M12 19V6M6 11l6-6 6 6', sw: 1.8},
    arrowIn: {d: 'M4 12h13M12 7l5 5-5 5M20 5v14', sw: 1.6},
    arrowOut: {d: 'M20 12H7M12 7l-5 5 5 5M4 5v14', sw: 1.6},
    sort: {d: 'M7 4v15M4 16l3 3 3-3M17 20V5M14 8l3-3 3 3', sw: 1.7},
    plus: {d: 'M12 5v14M5 12h14', sw: 1.8},
    star: {d: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z', sw: 1.4, join: 'miter'},
    pulse: {d: 'M2 12h4l3-7 4 14 3-7h6', sw: 1.6, join: 'miter'},
    noteDoc: {d: 'M6 3h9l3 3v15H6z M15 3v3h3', sw: 1.5},
    chatBubble: {d: 'M4 5h16v10H9l-4 4v-4H4z', sw: 1.5},
    filter: {d: 'M3 5h18l-7 8v6l-4-2v-4z', sw: 1.5},
    tick: {d: 'M2.8 12.9L8.9 19 21.2 4.8', sw: 1.6, cap: 'round'},
    chevron: {d: 'M6 9l6 6 6-6', sw: 1.8, cap: 'round', join: 'round'},
    caret: {d: 'M15 6l-6 6 6 6', sw: 1.7, cap: 'round', join: 'round'},
    search: {circle: [10.5, 10.5, 6.5], d: 'M20 20l-4.6-4.6', sw: 1.6, cap: 'round'},
    summary: {d: 'M5 6h14M5 11h14M5 16h8', extra: 'M19.5 15.5l1.6 1.6-4 4-1.7.1.1-1.7z', sw: 1.6},
    cal: {rect: [3.5, 5, 17, 15.5], d: 'M3.5 9.5h17M8 3.5v3M16 3.5v3', sw: 1.5},
    gear: {
        circle: [12, 12, 3],
        d: 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
        sw: 1.5,
        cap: 'round'
    },
    collapse: {rect: [3, 4, 18, 16], d: 'M9 4v16', sw: 1.5},
    panelRight: {rect: [3, 4, 18, 16], d: 'M15 4v16', pane: [15.7, 4.8, 4.6, 14.4], sw: 1.5},
    dots: {dots: [[12, 5], [12, 12], [12, 19]]},
    node: {circles: [[12, 12, 8]], dot: [12, 12, 2.5], sw: 1.5},
    constellation: {
        d: 'M5 17.5l4.2-9 5.8 3 4-6.5',
        circles: [[5, 17.5, 1.5], [9.2, 8.5, 1.5], [15, 11.5, 1.5], [19, 5, 1.5]],
        sw: 1.4,
        join: 'miter'
    },
    mic: {mic: true, sw: 1.6, cap: 'round', join: 'round'},
    tag: {d: 'M3 3h9l9 9-9 9-9-9z', circle: [7.5, 7.5, 1.4], sw: 1.5, join: 'miter'},
}

export interface IconProps {
    name: IconName
    /** Rendered box in px. Chrome uses 12–18; nav 17–18; mic button 0.34 × button size. */
    size?: number
    /** mic only — fills the capsule (recording state). */
    fill?: boolean
    /** panelRight only — shades the right pane when that panel is open. */
    active?: boolean
    /** Degrees. Used to point `chevron` right (-90) or up (180). */
    rotate?: number
    style?: React.CSSProperties
}

export function Icon({name, size = 18, fill = false, active = false, rotate = 0, style = {}}: IconProps) {
    const g = GLYPHS[name]
    if (!g) return null
    const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: g.sw || 1.5,
        strokeLinecap: g.cap || 'square',
        strokeLinejoin: g.join || 'miter',
        style: rotate
            ? {transform: `rotate(${rotate}deg)`, display: 'block', ...style}
            : {display: 'block', ...style},
    }
    if (g.dots) {
        return React.createElement(
            'svg',
            {...common, fill: 'currentColor', stroke: 'none'},
            g.dots.map(([cx, cy], i) => React.createElement('circle', {key: i, cx, cy, r: 1.6})),
        )
    }
    if (g.mic) {
        return (
            <svg {...common}>
                <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" fill={fill ? 'currentColor' : 'none'}/>
                <path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6"/>
            </svg>
        )
    }
    return (
        <svg {...common}>
            {g.rect && <rect x={g.rect[0]} y={g.rect[1]} width={g.rect[2]} height={g.rect[3]}/>}
            {g.circle && <circle cx={g.circle[0]} cy={g.circle[1]} r={g.circle[2]}/>}
            {g.circles && g.circles.map((c, i) => <circle key={i} cx={c[0]} cy={c[1]} r={c[2]}/>)}
            {g.d && <path d={g.d}/>}
            {g.dot && <circle cx={g.dot[0]} cy={g.dot[1]} r={g.dot[2]} fill="currentColor" stroke="none"/>}
            {g.extra && <path d={g.extra} fill="currentColor" stroke="none"/>}
            {g.pane && (
                <rect
                    x={g.pane[0]}
                    y={g.pane[1]}
                    width={g.pane[2]}
                    height={g.pane[3]}
                    fill={active ? 'currentColor' : 'none'}
                    opacity={active ? 0.28 : 0}
                    stroke="none"
                />
            )}
        </svg>
    )
}

export const ICON_NAMES = Object.keys(GLYPHS) as IconName[]
