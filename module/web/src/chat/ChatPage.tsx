/**
 * A single conversation. Loads history via `getMessages`, then streams replies through
 * `streamAssistantReply` — once a stream ends (success or error), always re-fetches `getMessages`
 * and replaces local state with the server's truth, so `PARTIAL`/`FAILED` status rendering (see
 * `Bubble.tsx`) needs no client-side guessing about what actually got persisted.
 */
import {useEffect, useRef, useState} from 'react'
import {Link, useParams} from 'react-router-dom'
import {AuthRequiredError} from '../auth/apiClient'
import {type ChatMessage, getMessages} from './chatApi'
import {streamAssistantReply} from './streamChatReply'
import {MessageThread} from './MessageThread'
import {ChatComposer} from './ChatComposer'
import type {DisplayMessage} from './Bubble'
import './chat.css'

type Phase = 'loading' | 'error' | 'ready'

function toDisplay(messages: ChatMessage[]): DisplayMessage[] {
    return messages.map(({id, role, status, content}) => ({id, role, status, content}))
}

function isAbortError(e: unknown): boolean {
    return e instanceof DOMException && e.name === 'AbortError'
}

export function ChatPage() {
    const {chatId} = useParams<{ chatId: string }>()
    const [phase, setPhase] = useState<Phase>('loading')
    const [loadError, setLoadError] = useState<string | null>(null)
    const [messages, setMessages] = useState<DisplayMessage[]>([])
    const [draft, setDraft] = useState('')
    const [sending, setSending] = useState(false)
    const [streamNotice, setStreamNotice] = useState<string | null>(null)
    const abortRef = useRef<AbortController | null>(null)

    useEffect(() => {
        if (!chatId) return
        let active = true
        setPhase('loading')
        setLoadError(null)
        getMessages(chatId)
            .then((history) => {
                if (!active) return
                setMessages(toDisplay(history))
                setPhase('ready')
            })
            .catch((e: unknown) => {
                if (!active) return
                if (e instanceof AuthRequiredError) return
                setLoadError(e instanceof Error ? e.message : String(e))
                setPhase('error')
            })
        return () => {
            active = false
        }
    }, [chatId])

    // Abort any in-flight stream when the user navigates away from this chat.
    useEffect(() => () => abortRef.current?.abort(), [])

    function onSend() {
        const content = draft.trim()
        if (!chatId || sending || content === '') return

        const now = Date.now()
        const userMsg: DisplayMessage = {id: `local-user-${now}`, role: 'USER', status: 'COMPLETE', content}
        const placeholderId = `local-reply-${now}`
        const placeholder: DisplayMessage = {
            id: placeholderId,
            role: 'ASSISTANT',
            status: 'COMPLETE',
            content: '',
            pending: true,
        }
        setMessages((prev) => [...prev, userMsg, placeholder])
        setDraft('')
        setSending(true)
        setStreamNotice(null)

        const controller = new AbortController()
        abortRef.current = controller

        streamAssistantReply(chatId, content, {
            signal: controller.signal,
            onToken: (chunk) => {
                setMessages((prev) =>
                    prev.map((m) => (m.id === placeholderId ? {...m, content: m.content + chunk} : m)),
                )
            },
        })
            .then((outcome) => {
                if (outcome === 'error') setStreamNotice('The reply was interrupted.')
            })
            .catch((e: unknown) => {
                if (e instanceof AuthRequiredError || isAbortError(e)) return
                setStreamNotice('The reply was interrupted.')
            })
            .finally(() => {
                abortRef.current = null
                setSending(false)
                // Reconcile with the server's truth — drops the optimistic bubbles above and applies
                // whatever status the backend actually persisted (COMPLETE/PARTIAL/FAILED).
                getMessages(chatId)
                    .then((history) => setMessages(toDisplay(history)))
                    .catch((e: unknown) => {
                        if (e instanceof AuthRequiredError) return
                    })
            })
    }

    if (phase === 'loading') {
    return (
        <div className="page">
            <p className="auth-muted">loading…</p>
        </div>
    )
    }

    if (phase === 'error') {
        return (
            <div className="page">
                <p className="auth-error">{loadError}</p>
                <Link to="/chats" className="chat-back-link">‹ back to chats</Link>
            </div>
        )
    }

    return (
        <div className="chat-page">
            <div className="chat-page-header">
                <Link to="/chats" className="chat-back-link">‹ chats</Link>
            </div>
            <MessageThread messages={messages}/>
            {streamNotice && <p className="auth-error chat-stream-notice">{streamNotice}</p>}
            <ChatComposer value={draft} onChange={setDraft} onSubmit={onSend} disabled={sending}/>
        </div>
    )
}
