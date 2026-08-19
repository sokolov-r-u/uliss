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

export function Bubble({role, status, content, pending}: DisplayMessage) {
    const isUser = role === 'USER'
    const label = pending ? null : statusLabel(status)
    return (
        <div className={isUser ? 'bubble-row bubble-row-user' : 'bubble-row bubble-row-assistant'}>
            <div className={isUser ? 'bubble bubble-user' : 'bubble bubble-assistant'}>
                <span className="bubble-kicker">{isUser ? 'You' : 'Uliss'}</span>
                <p className="bubble-content">
                    {content}
                    {pending && <span className="bubble-cursor" aria-hidden/>}
                </p>
                {label && <span className="bubble-status">{label}</span>}
            </div>
        </div>
    )
}
