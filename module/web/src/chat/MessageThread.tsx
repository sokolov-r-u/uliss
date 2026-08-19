import {useEffect, useRef} from 'react'
import {Bubble, type DisplayMessage} from './Bubble'

/** Scrollable message list, auto-scrolled to the latest content (including live streaming tokens). */
export function MessageThread({messages}: { messages: DisplayMessage[] }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const lastContentLength = messages.at(-1)?.content.length ?? 0

    useEffect(() => {
        const el = containerRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [messages.length, lastContentLength])

    return (
        <div className="message-thread" ref={containerRef}>
            {messages.length === 0 && <p className="auth-muted">Start the conversation.</p>}
            {messages.map((m) => (
                <Bubble key={m.id} {...m} />
            ))}
        </div>
    )
}
