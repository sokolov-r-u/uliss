import type {CSSProperties, ReactNode} from 'react'
import {Kicker} from '@uliss/design-system'

/**
 * Full-height screen frame — a quiet kicker (+ count) header over a flex body that centres a
 * DS `EmptyState` today and will hold a list once a backend exists. Used by the backend-less
 * destinations (`/notes`, `/sky`); `/search` draws its own field header.
 */
export function Screen({
                           kicker,
                           count,
                           right,
                           ground,
                           children,
                       }: {
    kicker: string
    count?: number
    right?: ReactNode
    /** Override the body background (Sky sits on `--sky-bg`). */
    ground?: string
    children: ReactNode
}) {
    const style: CSSProperties | undefined = ground ? {background: ground} : undefined
    return (
        <div className="screen" style={style}>
            <header className="screen-header">
                <span className="screen-header-label">
                    <Kicker size={9.5} spacing="3px" color="var(--accent)">{kicker}</Kicker>
                    {count != null && <span className="screen-header-count">{count}</span>}
                </span>
                {right}
            </header>
            <div className="screen-body">{children}</div>
        </div>
    )
}
