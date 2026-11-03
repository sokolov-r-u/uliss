import {useEffect, useRef} from 'react'
import {Button} from '@uliss/design-system'
import type {MoreState} from './useKeysetList'
import './list-more.css'

/**
 * The end of a paged list: asks for the next page once it scrolls into view, shows that a page is loading, and
 * offers Retry after a failed one. Renders nothing at the end of the list.
 */
export function ListMore({hasMore, state, onMore}: { hasMore: boolean; state: MoreState; onMore: () => void }) {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const element = ref.current
        if (!element || !hasMore || state !== 'idle' || typeof IntersectionObserver === 'undefined') return
        // a new observer reports the current visibility at once, so a page too short to scroll keeps loading
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) onMore()
        }, {rootMargin: '200px 0px'})
        observer.observe(element)
        return () => observer.disconnect()
    }, [hasMore, state, onMore])

    if (!hasMore) return null
    return <div ref={ref} className="list-more">
        {state === 'loading' && <span>Loading…</span>}
        {state === 'failed' && <>
            <span role="alert">Could not load more.</span>
            <Button size="sm" variant="quiet" onClick={onMore}>Retry</Button>
        </>}
    </div>
}
