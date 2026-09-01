import type {CSSProperties} from 'react'
import {Kicker} from '@uliss/design-system'
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

// Reading tokens only — Settings › Text size drives the body of a conversation.
const body: CSSProperties = {
    fontFamily: 'var(--font-text)',
    fontSize: 'var(--read-size)',
    lineHeight: 'var(--read-leading)',
    fontWeight: 'var(--read-weight)',
    color: 'var(--read-fg)',
    whiteSpace: 'pre-wrap',
    textWrap: 'pretty',
}

/**
 * A conversation turn as a 2px rule + alignment (DS `Bubble`) — never a capsule, never labelled on
 * the user's side. Extends the DS component with the streaming caret and a `PARTIAL`/`FAILED`
 * status line, both of which reflect real backend state (see `ChatPage` / `chatApi`).
 */
export function Bubble({role, status, content, pending}: DisplayMessage) {
    const label = pending ? null : statusLabel(status)

    if (role === 'USER') {
        return (
            <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: 20}}>
                <div style={{maxWidth: '84%'}}>
                    <div style={{borderRight: '2px solid var(--line-strong)', paddingRight: 14, ...body}}>
                        {content}
                    </div>
                    {label && <span className="bubble-status bubble-status-user">{label}</span>}
                </div>
            </div>
        )
    }

    return (
        <div style={{marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8}}>
            <Kicker size={8.5} spacing="3px" color="var(--cream)">Uliss</Kicker>
            <div style={{borderLeft: '2px solid var(--accent)', paddingLeft: 14, ...body}}>
                {content}
                {pending && <span className="bubble-cursor" aria-hidden/>}
            </div>
            {label && <span className="bubble-status">{label}</span>}
        </div>
    )
}
