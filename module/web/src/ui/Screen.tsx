import type {CSSProperties, ReactNode} from 'react'
import {ScreenHeader} from './ScreenHeader'

/**
 * Full-height screen frame — the shared `ScreenHeader` (kicker + count) over a scrolling body. Used by the
 * Settings root; list screens compose `ScreenHeader` directly.
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
            <ScreenHeader kicker={kicker} count={count} right={right}/>
            <div className="screen-body">{children}</div>
        </div>
    )
}
