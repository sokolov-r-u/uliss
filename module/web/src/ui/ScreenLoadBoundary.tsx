import {Component, type ReactNode, Suspense} from 'react'
import {EmptyState} from '@uliss/design-system'

/**
 * Wraps a lazily loaded screen: "Loading…" while its code arrives, and a reload offer when it cannot arrive. After a
 * deploy an open tab still asks for the old chunk names, which are gone; without this the whole app would go blank.
 */
export class ScreenLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = {failed: false}

    static getDerivedStateFromError() {
        return {failed: true}
    }

    componentDidCatch(error: unknown) {
        console.error('screen failed to load', error)
    }

    render() {
        if (this.state.failed) {
            return <EmptyState title="This screen could not load"
                               body="Uliss may have been updated. Reload to get the latest version."
                               action="Reload" onAction={() => window.location.reload()}/>
        }
        return <Suspense fallback={<p className="auth-muted" aria-live="polite">Loading…</p>}>
            {this.props.children}
        </Suspense>
    }
}
