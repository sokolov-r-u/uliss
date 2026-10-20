import {createContext, type ReactNode, useContext} from 'react'
import {Icon, IconButton, Kicker} from '@uliss/design-system'
import {BackButton} from './BackButton'

/** Opens the mobile navigation drawer; provided by `AppShell`, a no-op elsewhere (tests, fixtures). */
export const ShellNavContext = createContext<() => void>(() => undefined)

/**
 * The one screen header (kit `TopBar` on the phone, `WideHead` / `ContentHeader` on wide screens). A list screen
 * passes `kicker` (+ `count`); a detail screen passes `title` (+ `meta`), rendered as the page heading. `children`
 * replaces the label entirely (the search field). The menu button only shows below the 768px breakpoint. `back` adds
 * the way back to the previous screen of the app (an open note or chat).
 */
export function ScreenHeader({kicker, count, title, meta, right, back = false, children}: {
    kicker?: string
    count?: number | string
    title?: string
    meta?: ReactNode
    right?: ReactNode
    back?: boolean
    children?: ReactNode
}) {
    const openNav = useContext(ShellNavContext)
    const detail = title != null
    return (
        <header className={detail ? 'screen-head screen-head-detail' : 'screen-head'}>
            <span className="screen-head-menu">
                <IconButton s={44} title="Open navigation" aria-controls="app-navigation" onClick={openNav}>
                    <Icon name="menu" size={18}/>
                </IconButton>
            </span>
            {back && <BackButton/>}
            {children != null ? <div className="screen-head-main">{children}</div>
                : detail ? <div className="screen-head-main">
                        <h1 className="screen-head-title">{title}</h1>
                        {meta != null && <Kicker size={8.5} spacing="2px" color="var(--text-faint)">{meta}</Kicker>}
                    </div>
                    : <span className="screen-head-main screen-head-label">
                        {kicker && <Kicker size={9.5} spacing="3px" color="var(--accent)">{kicker}</Kicker>}
                        {count != null && <span className="screen-head-count">{count}</span>}
                    </span>}
            {right != null && <span className="screen-head-right">{right}</span>}
        </header>
    )
}
