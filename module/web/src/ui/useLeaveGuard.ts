import {useCallback, useEffect, useRef} from 'react'
import {type Blocker, useBlocker} from 'react-router-dom'

export interface LeaveGuard {
    /** `blocked` while a navigation waits for the user: `proceed()` leaves, `reset()` stays. */
    blocker: Blocker
    /** Lets every later navigation through, e.g. the one that follows a successful save. */
    release: () => void
}

/**
 * While [active] (unsaved changes), holds any navigation to another screen inside the app — links, the header's Back,
 * the browser's Back and Forward — and asks the browser to warn before the page unloads. Needs a data router.
 */
export function useLeaveGuard(active: boolean): LeaveGuard {
    const released = useRef(false)
    const blocker = useBlocker(({currentLocation, nextLocation}) =>
        active && !released.current && currentLocation.pathname !== nextLocation.pathname)

    useEffect(() => {
        if (!active) return
        const warn = (event: BeforeUnloadEvent) => {
            if (!released.current) event.preventDefault()
        }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [active])

    // the changes are gone (saved or undone) while a navigation waits: nothing is left to ask about
    useEffect(() => {
        if (blocker.state === 'blocked' && !active) blocker.reset()
    }, [blocker, active])

    const release = useCallback(() => {
        released.current = true
    }, [])
    return {blocker, release}
}
