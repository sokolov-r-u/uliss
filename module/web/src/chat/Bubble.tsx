import {Bubble as DesignBubble, PendingStatus} from '@uliss/design-system'
import {memo} from 'react'
import {MarkdownContent} from '../ui/MarkdownContent'
import type {ChatMessageRole, ChatMessageStatus} from './chatApi'
import type {ChatActivity} from './streamChatReply'

/**
 * A message as rendered in the thread — a `ChatMessage` plus client-only streaming state: the `pending` flag and the
 * assistant's last reported `activity`.
 */
export type DisplayMessage = {
    id: string
    role: ChatMessageRole
    status: ChatMessageStatus
    content: string
    pending?: boolean
    activity?: ChatActivity
}

function activityLabel(activity: ChatActivity | undefined): string {
    return activity === 'SEARCHING_NOTES' ? 'searching notes…' : 'thinking…'
}

function statusLabel(status: ChatMessageStatus): string | null {
    if (status === 'PARTIAL') return 'interrupted'
    if (status === 'FAILED') return 'failed to reply'
    if (status === 'CANCELED') return 'stopped'
    return null
}

/**
 * A conversation turn as a 2px rule + alignment (DS `Bubble`) — never a capsule, never labelled on
 * the user's side. Extends the DS component with the streaming caret, the pending activity line
 * shown until the reply's first text, and an incomplete status line, all of which reflect real
 * backend state (see `ChatPage` / `chatApi`). Memoized: while a reply streams only its own bubble re-renders, not
 * the markdown of every earlier message.
 */
export const Bubble = memo(function Bubble({role, status, content, pending, activity}: DisplayMessage) {
    const label = pending ? null : statusLabel(status)
    const waiting = pending && role === 'ASSISTANT' && content === ''

    return (
        <div className={role === 'USER' ? 'bubble-adapter bubble-adapter-user' : 'bubble-adapter'}>
            <DesignBubble role={role === 'USER' ? 'me' : 'uliss'}>
                {waiting
                    ? <PendingStatus label={activityLabel(activity)} pad="0" minHeight={0}/>
                    : role === 'ASSISTANT'
                    ? <MarkdownContent content={content} pending={pending}/>
                    : <>{content}{pending && <span className="bubble-cursor" aria-hidden/>}</>}
            </DesignBubble>
            {label &&
                <span className={role === 'USER' ? 'bubble-status bubble-status-user' : 'bubble-status'}>{label}</span>}
        </div>
    )
})
