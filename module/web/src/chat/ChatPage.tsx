import {useEffect, useRef, useState} from 'react'
import {Link, useParams} from 'react-router-dom'
import {ActionChip, Button, Kicker, Notice} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {requestChatSummary} from '../notes/noteApi'
import {NoticeOverlay} from '../ui/notice/NoticeOverlay'
import {type ChatMessage, getMessages, notifyChatListChanged} from './chatApi'
import {
    findPersistedReply,
    reconcileUntilTerminal,
    type ReconciliationTarget,
    targetForTrailingUser,
} from './reconcileChatTurn'
import {streamAssistantReply} from './streamChatReply'
import {MessageThread} from './MessageThread'
import {ChatComposer} from './ChatComposer'
import type {DisplayMessage} from './Bubble'
import './chat.css'

type PagePhase = 'loading' | 'error' | 'ready'
type GenerationPhase = 'idle' | 'streaming' | 'settling' | 'reconciliation-required'

function toDisplay(messages: ChatMessage[]): DisplayMessage[] {
    return messages.map(({id, role, status, content}) => ({id, role, status, content}))
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
}

export function ChatPage() {
    const {chatId} = useParams<{ chatId: string }>()
    const [pagePhase, setPagePhase] = useState<PagePhase>('loading')
    const [loadError, setLoadError] = useState<string | null>(null)
    const [persistedMessages, setPersistedMessages] = useState<ChatMessage[]>([])
    const [messages, setMessages] = useState<DisplayMessage[]>([])
    const [draft, setDraft] = useState('')
    const [generationPhase, setGenerationPhase] = useState<GenerationPhase>('idle')
    const [streamNotice, setStreamNotice] = useState<string | null>(null)
    const [summaryDialog, setSummaryDialog] = useState(false)
    const [summaryPending, setSummaryPending] = useState(false)
    const [summaryError, setSummaryError] = useState<string | null>(null)
    const [acceptedNoteId, setAcceptedNoteId] = useState<string | null>(null)
    const streamAbortRef = useRef<AbortController | null>(null)
    const reconciliationAbortRef = useRef<AbortController | null>(null)
    const reconciliationTargetRef = useRef<ReconciliationTarget | null>(null)
    const generationPhaseRef = useRef<GenerationPhase>('idle')
    const summaryPendingRef = useRef(false)
    const summaryRequestIdRef = useRef(0)
    const routeRevisionRef = useRef(0)
    const mountedRef = useRef(true)

    function updateGenerationPhase(phase: GenerationPhase) {
        generationPhaseRef.current = phase
        setGenerationPhase(phase)
    }

    function applyPersistedHistory(history: ChatMessage[]) {
        setPersistedMessages(history)
        setMessages(toDisplay(history))
        updateGenerationPhase('idle')
        setStreamNotice(null)
        reconciliationTargetRef.current = null
        notifyChatListChanged()
    }

    async function reconcile(
        target: ReconciliationTarget,
        poll: boolean,
        routeRevision = routeRevisionRef.current,
    ) {
        if (!chatId) return
        reconciliationAbortRef.current?.abort()
        const controller = new AbortController()
        reconciliationAbortRef.current = controller
        reconciliationTargetRef.current = target
        updateGenerationPhase('settling')
        try {
            const history = poll
                ? await reconcileUntilTerminal((signal) => getMessages(chatId, signal), target, {signal: controller.signal})
                : await getMessages(chatId, controller.signal)
            if (!poll && !findPersistedReply(history, target)) {
                throw new Error('The saved reply could not be confirmed yet.')
            }
            if (mountedRef.current && routeRevisionRef.current === routeRevision) applyPersistedHistory(history)
        } catch (error) {
            if (!mountedRef.current || routeRevisionRef.current !== routeRevision
                || error instanceof AuthRequiredError || isAbortError(error)) return
            updateGenerationPhase('reconciliation-required')
            setStreamNotice('The saved reply could not be confirmed. Retry before sending another message.')
        } finally {
            if (reconciliationAbortRef.current === controller) reconciliationAbortRef.current = null
        }
    }

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    useEffect(() => {
        if (!chatId) return
        let active = true
        const routeRevision = routeRevisionRef.current + 1
        routeRevisionRef.current = routeRevision
        const loadController = new AbortController()
        streamAbortRef.current?.abort()
        reconciliationAbortRef.current?.abort()
        setPagePhase('loading')
        setLoadError(null)
        updateGenerationPhase('idle')
        setAcceptedNoteId(null)
        setSummaryDialog(false)
        setSummaryPending(false)
        summaryPendingRef.current = false
        summaryRequestIdRef.current += 1
        getMessages(chatId, loadController.signal)
            .then((history) => {
                if (!active) return
                setPersistedMessages(history)
                setMessages(toDisplay(history))
                setPagePhase('ready')
                const target = targetForTrailingUser(history)
                if (target) void reconcile(target, true, routeRevision)
            })
            .catch((error: unknown) => {
                if (!active || error instanceof AuthRequiredError) return
                setLoadError(error instanceof Error ? error.message : String(error))
                setPagePhase('error')
            })
        return () => {
            active = false
            routeRevisionRef.current += 1
            loadController.abort()
            streamAbortRef.current?.abort()
            reconciliationAbortRef.current?.abort()
        }
    }, [chatId])

    async function onSend() {
        const content = draft.trim()
        if (!chatId || generationPhaseRef.current !== 'idle' || content === '') return

        const target: ReconciliationTarget = {
            afterMessageId: persistedMessages.at(-1)?.id,
            userContent: content,
        }
        reconciliationTargetRef.current = target
        const now = Date.now()
        const placeholderId = `local-reply-${now}`
        setMessages((previous) => [
            ...previous,
            {id: `local-user-${now}`, role: 'USER', status: 'COMPLETE', content},
            {id: placeholderId, role: 'ASSISTANT', status: 'COMPLETE', content: '', pending: true},
        ])
        setDraft('')
        updateGenerationPhase('streaming')
        setStreamNotice(null)
        setAcceptedNoteId(null)

        const controller = new AbortController()
        const routeRevision = routeRevisionRef.current
        streamAbortRef.current = controller
        let poll = false
        try {
            const outcome = await streamAssistantReply(chatId, content, {
                signal: controller.signal,
                onToken: (chunk) => {
                    if (!mountedRef.current) return
                    setMessages((previous) => previous.map((message) =>
                        message.id === placeholderId ? {...message, content: message.content + chunk} : message,
                    ))
                },
            })
            poll = outcome === 'error'
        } catch (error) {
            if (error instanceof AuthRequiredError) return
            poll = true
        } finally {
            if (streamAbortRef.current === controller) streamAbortRef.current = null
        }
        if (mountedRef.current && routeRevisionRef.current === routeRevision) {
            await reconcile(target, poll, routeRevision)
        }
    }

    function retryReconciliation() {
        const target = reconciliationTargetRef.current
        if (target) void reconcile(target, true)
    }

    async function confirmSummary() {
        if (!chatId || summaryPendingRef.current || generationPhaseRef.current !== 'idle') return
        const requestId = summaryRequestIdRef.current + 1
        summaryRequestIdRef.current = requestId
        summaryPendingRef.current = true
        setSummaryPending(true)
        setSummaryError(null)
        try {
            const summary = await requestChatSummary(chatId)
            if (!mountedRef.current || summaryRequestIdRef.current !== requestId) return
            setAcceptedNoteId(summary.noteId)
            setSummaryDialog(false)
        } catch (error) {
            if (!mountedRef.current || summaryRequestIdRef.current !== requestId
                || error instanceof AuthRequiredError || isAbortError(error)) return
            setSummaryError(error instanceof Error ? error.message : String(error))
        } finally {
            if (summaryRequestIdRef.current === requestId) {
                summaryPendingRef.current = false
                if (mountedRef.current) setSummaryPending(false)
            }
        }
    }

    if (pagePhase === 'loading') {
        return <div className="chat-page">
            <div className="chat-page-header"><Link to="/chats"
                                                    className="chat-back-link">‹ chats</Link></div>
            <p
                className="chat-state">Loading…</p></div>
    }

    if (pagePhase === 'error') {
        return <div className="chat-page">
            <div className="chat-page-header"><Link to="/chats"
                                                    className="chat-back-link">‹ chats</Link></div>
            <p
                className="chat-state chat-state-error">{loadError}</p></div>
    }

    const canSummarize = generationPhase === 'idle' && persistedMessages.length > 0 && !summaryPending

    return (
        <div className="chat-page">
            <div className="chat-page-header">
                <Link to="/chats" className="chat-back-link">‹ chats</Link>
                <Kicker size={9} spacing="3px" color="var(--text-faint)">Conversation</Kicker>
            </div>
            <MessageThread messages={messages}/>
            {acceptedNoteId && <p className="chat-summary-notice">Summary started. <Link
                to={`/notes/${acceptedNoteId}`}>Open note</Link></p>}
            {streamNotice && <div className="chat-stream-notice">
                <span>{streamNotice}</span>{generationPhase === 'reconciliation-required'
                && <Button size="sm" variant="quiet" onClick={retryReconciliation}>Retry</Button>}</div>}
            {generationPhase === 'settling' &&
                <p className="chat-settling-notice" aria-live="polite">Saving the reply…</p>}
            <ChatComposer
                value={draft}
                onChange={setDraft}
                onSubmit={() => void onSend()}
                disabled={generationPhase !== 'idle'}
                generationActive={generationPhase === 'streaming'}
                onStop={() => streamAbortRef.current?.abort()}
                action={<ActionChip label="Summarize" disabled={!canSummarize}
                                    onClick={() => {
                                        setSummaryError(null)
                                        setSummaryDialog(true)
                                    }}/>}/>
            {summaryDialog && <NoticeOverlay blocking={summaryPending}
                                             onBackdropClick={() => setSummaryDialog(false)}>
                <Notice
                    title="Create a summary note?"
                    body={<>{summaryError
                        ? <span className="chat-summary-error">{summaryError}</span>
                        : 'Uliss will create a permanent note in the background from the conversation saved so far.'}</>}
                    primary={summaryPending ? 'Creating…' : 'Create summary'}
                    secondary={summaryPending ? undefined : 'Cancel'}
                    busy={summaryPending}
                    primaryDisabled={summaryPending}
                    onPrimary={() => void confirmSummary()}
                    onSecondary={() => setSummaryDialog(false)}/>
            </NoticeOverlay>}
        </div>
    )
}
