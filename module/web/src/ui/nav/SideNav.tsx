import type {ReactNode} from 'react'
import {useEffect, useState} from 'react'
import {NavLink, useNavigate} from 'react-router-dom'
import {Icon, IconButton, Kicker, ListRow, NavRow, StarMark, Wordmark} from '@uliss/design-system'
import {useAuth} from '../../auth/AuthContext'
import {type Chat, listChats, subscribeToChatListChanges} from '../../chat/chatApi'

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
export function SideNav({open, collapsed, onClose, onToggleCollapsed}: {
    open: boolean
    collapsed: boolean
    onClose: () => void
    onToggleCollapsed: () => void
}) {
    const {logout} = useAuth()
    const navigate = useNavigate()
    const [chats, setChats] = useState<Chat[]>([])
    const [chatListRevision, setChatListRevision] = useState(0)

    useEffect(() => subscribeToChatListChanges(() => setChatListRevision((revision) => revision + 1)), [])

    useEffect(() => {
        let active = true
        listChats().then((items) => {
            if (active) setChats(items)
        }).catch(() => undefined)
        return () => {
            active = false
        }
    }, [chatListRevision])

    const go = (to: string) => () => {
        onClose()
        navigate(to)
    }

    return (
        <>
            {open && <button type="button" className="nav-backdrop" aria-label="Close navigation" onClick={onClose}/>}
            <aside id="app-navigation" aria-label="Primary navigation"
                   className={`side-nav${open ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
                <div className="side-nav-top">
                    <div className="side-nav-head">
                        <span className="side-nav-wordmark"><Wordmark size={24}/></span>
                        <span className="side-nav-mobile-close"><IconButton s={44} title="Close navigation"
                                                                            onClick={onClose}><Icon name="close"
                                                                                                    size={17}/></IconButton></span>
                        <IconButton s={30} title="Search" onClick={go('/search')}><Icon name="search"
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
                    {chats.length === 0 ? (
                        <>
                            <Kicker size={9} spacing="2.5px" color="var(--text-faint)">No chats yet</Kicker>
                            <p className="side-nav-body-note">Start a chat and it will appear here.</p>
                        </>
                    ) : (
                        <div className="side-nav-chat-list" aria-label="Recent chats">
                            {chats.map((chat) => <ListRow key={chat.id} title={chat.title} dots={false}
                                                          onClick={go(`/chats/${chat.id}`)}/>)}
                        </div>
                    )}
                </div>

                <div className="side-nav-foot">
                    <span className="side-nav-avatar"><StarMark size={15} glow={false}/></span>
                    <button type="button" className="side-nav-signout" onClick={() => void logout()}>Sign out</button>
                    <IconButton s={26} title="Settings" onClick={go('/settings')}><Icon name="gear"
                                                                                        size={15}/></IconButton>
                    <span className="side-nav-collapse">
                        <IconButton s={30} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                                    onClick={onToggleCollapsed}>
                            <Icon name="chevron" size={14} rotate={collapsed ? -90 : 90}/>
                        </IconButton>
                    </span>
                </div>
            </aside>
        </>
    )
}
