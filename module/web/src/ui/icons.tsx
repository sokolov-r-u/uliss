/**
 * Small inline glyphs for the chat composer. Same convention as
 * `ui/notice/glyphs.tsx`: plain functions, stroke=currentColor, square line caps
 * (no border-radius anywhere in the brand — sharp cuts only). Nav / shell chrome
 * uses the design-system `<Icon>` instead.
 */

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
