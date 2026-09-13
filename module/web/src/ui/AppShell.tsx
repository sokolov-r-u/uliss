import {useEffect, useRef, useState} from 'react'
import {Outlet, useLocation, useNavigate} from 'react-router-dom'
import {Icon, IconButton, TopBar} from '@uliss/design-system'
import {OnboardingDriver} from '../onboarding/OnboardingDriver'
import {SideNav} from './nav/SideNav'
import './AppShell.css'

/**
 * Authenticated app layout: mobile hamburger + drawer / desktop nav rail, wrapping the active
 * route (`Outlet`). `OnboardingDriver` mounts here (once per session) rather than per-page, so it
 * keeps running as the blocking overlay across navigation between the five destinations.
 */
export function AppShell() {
    const [navOpen, setNavOpen] = useState(false)
    const [navCollapsed, setNavCollapsed] = useState(false)
    const location = useLocation()
    const navigate = useNavigate()
    const restoreFocusRef = useRef<HTMLElement | null>(null)

    const segment = location.pathname.split('/').filter(Boolean)
    const labels: Record<string, string> = {
        chats: 'Chats', notes: 'Notes', search: 'Search', constellations: 'Constellations',
        sky: 'Sky', updates: 'Updates', settings: 'Settings', appearance: 'Appearance',
        account: 'Account', language: 'Language',
    }
    const detailRoute = segment.length > 1 && (segment[0] === 'chats' || segment[0] === 'notes')
    const labelKey = detailRoute ? segment[0] : (segment.at(-1) ?? 'chats')
    const label = labels[labelKey] ?? 'Chats'
    const title = segment[0] === 'chats' && segment.length > 1
        ? 'Conversation'
        : segment[0] === 'notes' && segment.length > 1 ? 'Note' : undefined

    const openNav = () => {
        restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setNavOpen(true)
    }

    const closeNav = () => {
        setNavOpen(false)
        requestAnimationFrame(() => restoreFocusRef.current?.focus())
    }

    // Auto-close the mobile drawer on every navigation (harmless no-op on desktop).
    useEffect(() => {
        setNavOpen(false)
    }, [location.pathname])

    useEffect(() => {
        if (!navOpen) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                closeNav()
            }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [navOpen])

    return (
        <div className="app-shell">
            <header className="app-top-bar">
                <TopBar
                    onMenu={openNav}
                    label={label}
                    title={title}
                    right={<IconButton s={44} title="Search" onClick={() => navigate('/search')}><Icon name="search"
                                                                                                       size={16}/></IconButton>}
                />
            </header>
            <SideNav open={navOpen} collapsed={navCollapsed} onClose={closeNav}
                     onToggleCollapsed={() => setNavCollapsed((value) => !value)}/>
            <main className="app-main">
                <Outlet/>
            </main>
            <OnboardingDriver/>
        </div>
    )
}
