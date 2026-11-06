import {Component, type ReactNode, Suspense} from 'react'
import {EmptyState, useMessages} from '@uliss/design-system'
import {commonMessages} from '../i18n/common.messages'
import {uiMessages} from './ui.messages'

/**
 * Wraps a lazily loaded screen: "Loading…" while its code arrives, and a reload offer when it cannot arrive. After a
 * deploy an open tab still asks for the old chunk names, which are gone; without this the whole app would go blank.
 */
function LoadFailed() {
    const t = useMessages(uiMessages)
    return <EmptyState title={t.screenFailed} body={t.screenFailedBody} action={t.reload}
                       onAction={() => window.location.reload()}/>
}

function Loading() {
    return <p className="auth-muted" aria-live="polite">{useMessages(commonMessages).loading}</p>
}

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
            return <LoadFailed/>
        }
        return <Suspense fallback={<Loading/>}>
            {this.props.children}
        </Suspense>
    }
}
