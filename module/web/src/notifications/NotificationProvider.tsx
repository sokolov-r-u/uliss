/**
 * Generic notice mechanism. Holds a FIFO queue of notices and renders the head one over a
 * dimmed-blurred backdrop (NoticeOverlay). `useNotice().notify(...)` shows a notice from
 * anywhere; blocking ones can't be dismissed. Onboarding uses its own NoticeOverlay directly
 * (its steps are stateful) — this provider covers fire-and-forget notices (e.g. dispatches).
 */
import {createContext, type ReactNode, useCallback, useContext, useMemo, useState} from 'react'
import {Notice, type NoticeProps} from '../ui/notice/Notice'
import {NoticeOverlay} from '../ui/notice/NoticeOverlay'

/** A queued notice: content only — the provider supplies buttons/close wiring. */
export type NoticeInput = Omit<
    NoticeProps,
    'onPrimary' | 'onSecondary' | 'onClose' | 'showClose' | 'width'
> & {
    /** Called when the primary button is pressed (before auto-dismiss). */
    onConfirm?: () => void
    /** Called when dismissed via X / backdrop / secondary. */
    onDismiss?: () => void
}

type QueuedNotice = NoticeInput & { id: number }

type NotificationApi = {
    /** Enqueue a notice; returns its id. */
    notify: (input: NoticeInput) => number
    /** Remove a specific notice from the queue. */
    dismiss: (id: number) => void
}

const NotificationContext = createContext<NotificationApi | null>(null)

let nextId = 1

export function NotificationProvider({children}: { children: ReactNode }) {
    const [queue, setQueue] = useState<QueuedNotice[]>([])

    const dismiss = useCallback((id: number) => {
        setQueue((q) => q.filter((n) => n.id !== id))
    }, [])

    const notify = useCallback((input: NoticeInput) => {
        const id = nextId++
        setQueue((q) => [...q, {...input, id}])
        return id
    }, [])

    const api = useMemo<NotificationApi>(() => ({notify, dismiss}), [notify, dismiss])

    const head = queue[0]

    return (
        <NotificationContext value={api}>
            {children}
            {head &&
                (() => {
                    const close = () => {
                        head.onDismiss?.()
                        dismiss(head.id)
                    }
                    return (
                        <NoticeOverlay blocking={head.blocking} onBackdropClick={close}>
                            <Notice
                                {...head}
                                showClose={!head.blocking}
                                secondary={head.blocking ? undefined : (head.secondary ?? 'Close')}
                                onSecondary={head.blocking ? undefined : close}
                                onClose={close}
                                onPrimary={() => {
                                    head.onConfirm?.()
                                    dismiss(head.id)
                                }}
                            />
                        </NoticeOverlay>
                    )
                })()}
        </NotificationContext>
    )
}

export function useNotice(): NotificationApi {
    const ctx = useContext(NotificationContext)
    if (!ctx) throw new Error('useNotice must be used within <NotificationProvider>')
    return ctx
}
