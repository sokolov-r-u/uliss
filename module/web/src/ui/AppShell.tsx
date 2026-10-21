import {useEffect, useRef, useState} from 'react'
import {Outlet, useLocation} from 'react-router-dom'
import {OnboardingDriver} from '../onboarding/OnboardingDriver'
import {returnsToNavDialog} from './actions/deleteDialogReturn'
import {SideNav} from './nav/SideNav'
import {ShellNavContext} from './ScreenHeader'
import './AppShell.css'

/**
 * Authenticated app layout: mobile drawer / desktop nav rail, wrapping the active route (`Outlet`). Each
 * screen's `ScreenHeader` carries the mobile menu button and opens the drawer through `ShellNavContext`.
 * `OnboardingDriver` mounts here (once per session) rather than per-page, so it keeps running as the blocking
 * overlay across navigation between the five destinations.
 */
export function AppShell() {
    const [navOpen, setNavOpen] = useState(false)
    const [navCollapsed, setNavCollapsed] = useState(false)
    const location = useLocation()
    const restoreFocusRef = useRef<HTMLElement | null>(null)

    const openNav = () => {
        restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setNavOpen(true)
    }

    const closeNav = () => {
        setNavOpen(false)
        requestAnimationFrame(() => restoreFocusRef.current?.focus())
    }

    // Auto-close the mobile drawer on every navigation (harmless no-op on desktop), unless the navigation returns to
    // a delete dialog that lives in the drawer.
    useEffect(() => {
        setNavOpen(returnsToNavDialog(location.search))
        // Only a new screen decides; the dialog clears its marker from the search right after it reopens.
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
            <SideNav open={navOpen} collapsed={navCollapsed} onClose={closeNav}
                     onToggleCollapsed={() => setNavCollapsed((value) => !value)}/>
            <main className="app-main">
                <ShellNavContext.Provider value={openNav}><Outlet/></ShellNavContext.Provider>
            </main>
            <OnboardingDriver/>
        </div>
    )
}
