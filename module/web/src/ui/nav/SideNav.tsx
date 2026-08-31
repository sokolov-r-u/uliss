import type {ReactNode} from 'react'
import {NavLink, useNavigate} from 'react-router-dom'
import {Icon, IconButton, Kicker, NavRow, StarMark, Wordmark} from '@uliss/design-system'
import {useAuth} from '../../auth/AuthContext'

/** The five destinations — this order, every breakpoint (see NavRow.prompt.md). */
const NAV_ITEMS: { to: string; label: string; icon: ReactNode }[] = [
    {to: '/chats', label: 'Chats', icon: <Icon name="node" size={16}/>},
    {to: '/notes', label: 'Notes', icon: <Icon name="journal" size={16}/>},
    {to: '/constellations', label: 'Constellations', icon: <Icon name="constellation" size={17}/>},
    {to: '/sky', label: 'Sky', icon: <Icon name="star" size={16}/>},
    {to: '/updates', label: 'Updates', icon: <Icon name="pulse" size={17}/>},
]

/**
 * Single responsive nav: a mobile overlay drawer (`open` toggles a CSS transform) that becomes a
 * permanent rail at the `900px` breakpoint (see `AppShell.css`) — `open`/`onClose` are ignored above
 * it since the drawer CSS no longer applies. The pinned / chat-note lists from the mock land in
 * wave 5 (they need backend data); until then the body shows the day-one empty note.
 */
export function SideNav({open, onClose}: { open: boolean; onClose: () => void }) {
    const {logout} = useAuth()
    const navigate = useNavigate()

    const goSearch = () => {
        onClose()
        navigate('/search')
    }

    return (
        <>
            {open && <div className="nav-backdrop" onClick={onClose} aria-hidden/>}
            <aside className={open ? 'side-nav open' : 'side-nav'}>
                <div className="side-nav-top">
                    <div className="side-nav-head">
                        <Wordmark size={24}/>
                        <IconButton s={30} title="Search" onClick={goSearch}><Icon name="search"
                                                                                   size={16}/></IconButton>
                    </div>

                    <NavLink to="/chats" onClick={onClose} className="side-nav-new">
                        <span className="side-nav-new-icon"><Icon name="plus" size={15}/></span>
                        <span className="side-nav-new-label">New</span>
                    </NavLink>

                    <nav className="side-nav-links">
                        {NAV_ITEMS.map(({to, label, icon}) => (
                            <NavLink key={to} to={to} onClick={onClose} className="side-nav-link">
                                {({isActive}) => <NavRow icon={icon} label={label} active={isActive}/>}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                <div className="side-nav-body">
                    <Kicker size={9} spacing="2.5px" color="var(--text-faint)">Nothing here yet</Kicker>
                    <p className="side-nav-body-note">Chats and notes will collect here as you talk.</p>
                </div>

                <div className="side-nav-foot">
                    <span className="side-nav-avatar"><StarMark size={15} glow={false}/></span>
                    <button type="button" className="side-nav-signout" onClick={() => void logout()}>Sign out</button>
                    <IconButton s={26} title="Settings — coming soon"><Icon name="gear" size={15}/></IconButton>
                </div>
            </aside>
        </>
    )
}
