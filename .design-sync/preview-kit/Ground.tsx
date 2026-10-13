import type {CSSProperties, ReactNode} from 'react'

// Preview-only host ground: mirrors the web SPA body (module/web/src/app.css) —
// --bg ground, --cream text, --font-text, token focus ring. Uliss components assume this ground.
const HOST_FOCUS = ':where(button, input, select, textarea, a, [tabindex]):focus-visible'
    + '{outline:2px solid var(--accent-2);outline-offset:3px}'

export function Ground({children, width, pad = 20, style}: {
    children: ReactNode
    width?: number
    pad?: number
    style?: CSSProperties
}) {
    return (
        <div style={{
            background: 'var(--bg)',
            color: 'var(--cream)',
            fontFamily: 'var(--font-text)',
            padding: pad,
            width,
            boxSizing: 'border-box',
            ...style,
        }}>
            <style>{HOST_FOCUS}</style>
            {children}
        </div>
    )
}
