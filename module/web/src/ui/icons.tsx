/**
 * Small inline glyphs for app chrome (nav + chat composer). Same convention as
 * `ui/notice/glyphs.tsx`: plain functions, stroke=currentColor, square line caps (no
 * border-radius anywhere in the brand — sharp cuts only).
 */

export function MenuIcon({s = 20}: { s?: number }) {
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
             strokeLinecap="square" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h10"/>
        </svg>
    )
}

export function ChatIcon({s = 18}: { s?: number }) {
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
             strokeLinecap="square" aria-hidden>
            <path d="M4 5h16v11H9l-4 4V5Z"/>
        </svg>
    )
}

export function JournalIcon({s = 18}: { s?: number }) {
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
             strokeLinecap="square" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h11"/>
        </svg>
    )
}

export function GraphIcon({s = 18}: { s?: number }) {
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
             strokeLinejoin="miter" aria-hidden>
            <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>
        </svg>
    )
}

export function SendIcon({s = 18}: { s?: number }) {
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
             strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
            <path d="M12 19V6M6 11l6-6 6 6"/>
        </svg>
    )
}

export function MicIcon({s = 18}: { s?: number }) {
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/>
            <path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6"/>
        </svg>
    )
}
