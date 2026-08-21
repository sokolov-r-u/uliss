import {useEffect, useState} from 'react'
import {Outlet, useLocation} from 'react-router-dom'
import {OnboardingDriver} from '../onboarding/OnboardingDriver'
import {TopBar} from './nav/TopBar'
import {SideNav} from './nav/SideNav'
import './AppShell.css'

/**
 * Authenticated app layout: mobile hamburger + drawer / desktop nav rail, wrapping the active
 * route (`Outlet`). `OnboardingDriver` mounts here (once per session) rather than per-page, so it
 * keeps running as the blocking overlay across chat/journal/graph navigation.
 */
export function AppShell() {
    const [navOpen, setNavOpen] = useState(false)
    const location = useLocation()

    // Auto-close the mobile drawer on every navigation (harmless no-op on desktop).
    useEffect(() => {
        setNavOpen(false)
    }, [location.pathname])

    return (
        <div className="app-shell">
            <TopBar onMenuClick={() => setNavOpen(true)}/>
            <SideNav open={navOpen} onClose={() => setNavOpen(false)}/>
            <main className="app-main">
                <Outlet/>
            </main>
            <OnboardingDriver/>
        </div>
    )
}
