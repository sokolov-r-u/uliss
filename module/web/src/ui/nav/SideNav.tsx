import type {ComponentType} from 'react'
import {NavLink} from 'react-router-dom'
import {Kicker, Wordmark} from '@uliss/design-system'
import {ChatIcon, GraphIcon, JournalIcon} from '../icons'

const NAV_ITEMS: { to: string; label: string; gloss: string; Icon: ComponentType<{ s?: number }> }[] = [
    {to: '/chats', label: 'Chat', gloss: 'φωνή', Icon: ChatIcon},
    {to: '/journal', label: 'Journal', gloss: 'ἡμέρα', Icon: JournalIcon},
    {to: '/graph', label: 'Constellation', gloss: 'οὐρανός', Icon: GraphIcon},
]

/**
 * Single responsive nav component: a mobile overlay drawer (`open` toggles a CSS transform) that
 * becomes a permanent desktop rail at the `900px` breakpoint (see `AppShell.css`) — `open`/`onClose`
 * are simply ignored above that breakpoint since the drawer CSS no longer applies.
 */
export function SideNav({open, onClose}: { open: boolean; onClose: () => void }) {
    return (
        <>
            {open && <div className="nav-backdrop" onClick={onClose} aria-hidden/>}
            <aside className={open ? 'side-nav open' : 'side-nav'}>
                <div className="side-nav-brand">
                    <Wordmark size={28}/>
                    <Kicker size={9} spacing="3px">Voice journal</Kicker>
                </div>
                <nav className="side-nav-links">
                    {NAV_ITEMS.map(({to, label, gloss, Icon}) => (
                        <NavLink
                            key={to}
                            to={to}
                            onClick={onClose}
                            className={({isActive}) => (isActive ? 'nav-link active' : 'nav-link')}
                        >
              <span className="nav-link-icon">
                <Icon/>
              </span>
                            <span className="nav-link-text">
                <span className="nav-link-label">{label}</span>
                <span className="nav-link-gloss">{gloss}</span>
              </span>
                        </NavLink>
                    ))}
                </nav>
            </aside>
        </>
    )
}
