import type {ReactNode} from 'react'
import {Link} from 'react-router-dom'
import {Kicker, useMessages} from '@uliss/design-system'
import {commonMessages} from '../i18n/common.messages'

/** Sub-screen frame for Settings — a back link to the root + the section kicker, over a
 *  scrolling body with a reading-width column; `wide` gives long text the chat's reading width. */
export function SettingsShell({kicker, wide = false, children}: { kicker: string; wide?: boolean; children: ReactNode }) {
    const common = useMessages(commonMessages)
    return (
        <div className="screen">
            <header className="settings-header">
                <Link to="/settings" className="settings-back">← {common.settings}</Link>
                <Kicker size={9} spacing="3px" color="var(--accent)">{kicker}</Kicker>
            </header>
            <div className="settings-body">
                <div className={wide ? 'settings-col settings-col-wide' : 'settings-col'}>{children}</div>
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
