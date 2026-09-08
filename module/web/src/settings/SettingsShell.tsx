import type {ReactNode} from 'react'
import {Link} from 'react-router-dom'
import {Kicker} from '@uliss/design-system'

/** Sub-screen frame for Settings — a back link to the root + the section kicker, over a
 *  scrolling body with a reading-width column. */
export function SettingsShell({kicker, children}: { kicker: string; children: ReactNode }) {
    return (
        <div className="screen">
            <header className="settings-header">
                <Link to="/settings" className="settings-back">← Settings</Link>
                <Kicker size={9} spacing="3px" color="var(--accent)">{kicker}</Kicker>
            </header>
            <div className="settings-body">
                <div className="settings-col">{children}</div>
            </div>
        </div>
    )
}

/** Kicker + hairline — the one divider used between settings groups. */
export function SectionLabel({children}: { children: ReactNode }) {
    return (
        <div className="settings-section">
            <Kicker size={8.5} spacing="3px" color="var(--text-muted)">{children}</Kicker>
            <span className="settings-section-rule"/>
        </div>
    )
}
