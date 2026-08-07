/**
 * Small inline glyphs used by the Notice mechanism. Ported from the Claude Design
 * `uliss-notify.jsx` (window.U set) — the shared design-system npm package only ships
 * Wordmark/Kicker/PostBadge/DevRule, so the notice-specific marks live here.
 */
import type {CSSProperties, ReactNode} from 'react'

/** Greek gloss text (e.g. "ὄνομα · your name") in the serif face with wide tracking. */
export function Greek({
                          children,
                          size = 13,
                          color = 'var(--accent-2)',
                          style = {},
                      }: {
    children: ReactNode
    size?: number
    color?: string
    style?: CSSProperties
}) {
    return (
        <span
            style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: size,
                letterSpacing: '0.5px',
                color,
                ...style,
            }}
        >
      {children}
    </span>
    )
}

/** Four-point star motif — header ornament on plaque/minimal notices. */
export function StarMark({size = 20, color = 'var(--accent-2)'}: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 1 L13.6 10.4 L23 12 L13.6 13.6 L12 23 L10.4 13.6 L1 12 L10.4 10.4 Z" fill={color}/>
        </svg>
    )
}

export function IcClose({s = 17}: { s?: number }) {
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
             strokeLinecap="square" aria-hidden>
            <path d="M5 5l14 14M19 5L5 19"/>
        </svg>
    )
}

export function IcChevron({s = 14, up = false}: { s?: number; up?: boolean }) {
    return (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="square"
            style={{transform: up ? 'rotate(180deg)' : 'none', transition: 'transform .2s'}}
            aria-hidden
        >
            <path d="M6 9l6 6 6-6"/>
        </svg>
    )
}

export function IcCal({s = 17}: { s?: number }) {
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
             strokeLinecap="square" aria-hidden>
            <rect x="3.5" y="5" width="17" height="15.5"/>
            <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/>
        </svg>
    )
}

export function IcCaret({s = 14, dir = 'left'}: { s?: number; dir?: 'left' | 'right' }) {
    return (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="square"
            style={{transform: dir === 'right' ? 'rotate(180deg)' : 'none'}}
            aria-hidden
        >
            <path d="M14 6l-6 6 6 6"/>
        </svg>
    )
}
