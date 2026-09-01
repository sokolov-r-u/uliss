/**
 * Generic notice mechanism. Holds a FIFO queue of notices and renders the head one over a
 * dimmed-blurred backdrop (NoticeOverlay). `useNotice().notify(...)` shows a notice from
 * anywhere; blocking ones can't be dismissed. `useNotice().confirm(...)` asks a yes/no through
 * the design-system Dialog (a way out first, the act second). Onboarding uses its own
 * NoticeOverlay directly (its steps are stateful) — this provider covers fire-and-forget notices
 * and confirmations.
 */
import {createContext, type ReactNode, useCallback, useContext, useMemo, useState} from 'react'
import {createPortal} from 'react-dom'
import {Dialog} from '@uliss/design-system'
import {Notice, type NoticeProps} from '../ui/notice/Notice'
import {NoticeOverlay} from '../ui/notice/NoticeOverlay'

/** A queued notice: content only — the provider supplies buttons/close wiring. */
export type NoticeInput = Omit<
    NoticeProps,
    'onPrimary' | 'onSecondary' | 'onClose' | 'onSkip' | 'showClose' | 'width'
> & {
    /** Called when the primary button is pressed (before auto-dismiss). */
    onConfirm?: () => void
    /** Called when dismissed via X / backdrop / secondary. */
    onDismiss?: () => void
}

type QueuedNotice = NoticeInput & { id: number }

/** A confirmation asked through the design-system Dialog. */
export type ConfirmInput = {
    title: string
    /** What will happen and what survives — the Dialog body. */
    body?: string
    confirm?: string
    cancel?: string
    /** Terracotta confirm label — deletions only. */
    danger?: boolean
    onConfirm?: () => void
    onCancel?: () => void
}

type NotificationApi = {
    /** Enqueue a notice; returns its id. */
    notify: (input: NoticeInput) => number
    /** Remove a specific notice from the queue. */
    dismiss: (id: number) => void
    /** Show a modal confirmation. Wire side effects through the callbacks. */
    confirm: (input: ConfirmInput) => void
}

const NotificationContext = createContext<NotificationApi | null>(null)

let nextId = 1

export function NotificationProvider({children}: { children: ReactNode }) {
    const [queue, setQueue] = useState<QueuedNotice[]>([])
    const [dialog, setDialog] = useState<ConfirmInput | null>(null)

    const dismiss = useCallback((id: number) => {
        setQueue((q) => q.filter((n) => n.id !== id))
    }, [])

    const notify = useCallback((input: NoticeInput) => {
        const id = nextId++
        setQueue((q) => [...q, {...input, id}])
        return id
    }, [])

    const confirm = useCallback((input: ConfirmInput) => {
        setDialog(input)
    }, [])

    const api = useMemo<NotificationApi>(() => ({notify, dismiss, confirm}), [notify, dismiss, confirm])

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
            {dialog &&
                createPortal(
                    <Dialog
                        title={dialog.title}
                        body={dialog.body}
                        confirm={dialog.confirm}
                        cancel={dialog.cancel}
                        danger={dialog.danger}
                        onConfirm={() => {
                            dialog.onConfirm?.()
                            setDialog(null)
                        }}
                        onCancel={() => {
                            dialog.onCancel?.()
                            setDialog(null)
                        }}
                    />,
                    document.body,
                )}
        </NotificationContext>
    )
}

export function useNotice(): NotificationApi {
    const ctx = useContext(NotificationContext)
    if (!ctx) throw new Error('useNotice must be used within <NotificationProvider>')
    return ctx
}
