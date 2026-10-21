import {useLayoutEffect, useRef} from 'react'
import {EmptyState} from '@uliss/design-system'
import {Bubble, type DisplayMessage} from './Bubble'

interface MessageThreadProps {
    messages: DisplayMessage[]
    hasMore: boolean
    isLoadingOlder: boolean
    onLoadOlder: () => void
}

interface ScrollSnapshot {
    firstMessageId?: string
    messageCount: number
    scrollHeight: number
    scrollTop: number
    /** The reader was at the end: a growing reply keeps them there; reading further up stays put. */
    atBottom: boolean
}

const BOTTOM_SLACK_PX = 64

function snapshotOf(el: HTMLDivElement, messages: DisplayMessage[]): ScrollSnapshot {
    return {
        firstMessageId: messages[0]?.id,
        messageCount: messages.length,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        atBottom: el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX,
    }
}

/** Scrollable message list with an anchored prepend path and tail auto-scrolling. */
export function MessageThread({messages, hasMore, isLoadingOlder, onLoadOlder}: MessageThreadProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const snapshotRef = useRef<ScrollSnapshot | null>(null)
    const lastContentLength = messages.at(-1)?.content.length ?? 0

    useLayoutEffect(() => {
        const el = containerRef.current
        if (!el) return
        const previous = snapshotRef.current
        const previousFirstIndex = previous?.firstMessageId
            ? messages.findIndex((message) => message.id === previous.firstMessageId)
            : -1
        if (previous && previousFirstIndex > 0) {
            el.scrollTop = previous.scrollTop + el.scrollHeight - previous.scrollHeight
        } else if (!previous || (previousFirstIndex === 0
            && (messages.length !== previous.messageCount || previous.atBottom))) {
            // a new message goes to the end; streamed text follows only a reader who is at the end
            el.scrollTop = el.scrollHeight
        }
        snapshotRef.current = snapshotOf(el, messages)
    }, [messages.length, lastContentLength])

    function handleScroll() {
        const el = containerRef.current
        if (!el) return
        snapshotRef.current = snapshotOf(el, messages)
        if (el.scrollTop <= 48 && hasMore && !isLoadingOlder) onLoadOlder()
    }

    const historyStatus = isLoadingOlder
        ? 'Loading earlier messages…'
        : !hasMore && messages.length > 0 ? 'Beginning of conversation' : ''

    return (
        <div className="message-thread" ref={containerRef} onScroll={handleScroll}>
            {messages.length > 0 && <p className="message-history-status" aria-live="polite">{historyStatus}</p>}
            {messages.length === 0 ? (
                <EmptyState
                    title="Nothing said yet"
                    body="Write a thought below. Uliss keeps the thread and pulls out a note when one is worth keeping."
                />
            ) : (
                messages.map((m) => <Bubble key={m.id} {...m} />)
            )}
        </div>
    )
}
