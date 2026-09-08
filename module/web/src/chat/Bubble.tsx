import {Bubble as DesignBubble} from '@uliss/design-system'
import type {ChatMessageRole, ChatMessageStatus} from './chatApi'

/** A message as rendered in the thread — a `ChatMessage` plus a client-only `pending` streaming flag. */
export type DisplayMessage = {
    id: string
    role: ChatMessageRole
    status: ChatMessageStatus
    content: string
    pending?: boolean
}

function statusLabel(status: ChatMessageStatus): string | null {
    if (status === 'PARTIAL') return 'interrupted'
    if (status === 'FAILED') return 'failed to reply'
    return null
}

/**
 * A conversation turn as a 2px rule + alignment (DS `Bubble`) — never a capsule, never labelled on
 * the user's side. Extends the DS component with the streaming caret and a `PARTIAL`/`FAILED`
 * status line, both of which reflect real backend state (see `ChatPage` / `chatApi`).
 */
export function Bubble({role, status, content, pending}: DisplayMessage) {
    const label = pending ? null : statusLabel(status)

    return (
        <div className={role === 'USER' ? 'bubble-adapter bubble-adapter-user' : 'bubble-adapter'}>
            <DesignBubble role={role === 'USER' ? 'me' : 'uliss'}>
                {content}
                {pending && <span className="bubble-cursor" aria-hidden/>}
            </DesignBubble>
            {label &&
                <span className={role === 'USER' ? 'bubble-status bubble-status-user' : 'bubble-status'}>{label}</span>}
        </div>
    )
}
